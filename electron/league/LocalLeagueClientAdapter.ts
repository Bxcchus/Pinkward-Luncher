import { spawn } from 'node:child_process';
import { access } from 'node:fs/promises';
import path from 'node:path';
import type { LeagueClientAdapter } from './LeagueClientAdapter.js';
import { parseLeagueGameResult } from './gameResult.js';
import { parseLeagueIdentity } from './leagueIdentity.js';
import { botPlanForRole, positionForRole } from './botRoster.js';
import {
  installedLeagueDirectories,
  LcuHttpClient,
  LcuHttpError,
  runningInstallationDirectory,
} from './LcuHttpClient.js';
import { RiotClientHttpClient, RiotClientHttpError } from './RiotClientHttpClient.js';
import type {
  AdapterCommandResult,
  BotFillRole,
  BotLobbyConfiguration,
  CustomLobbyConfiguration,
  LeagueGameResultSnapshot,
  LeagueIdentitySnapshot,
  LeagueClientState,
  LeagueStatusSnapshot,
  LobbyCredentials,
} from './types.js';

const CUSTOM_QUEUE_ID = 3100;
const SUMMONERS_RIFT_MAP_ID = 11;
const REQUIRED_FUNCTIONS = [
  'GetLolGameflowV1GameflowPhase',
  'GetLolGameflowV1Session',
  'GetLolLobbyV1CustomGames',
  'GetLolLobbyV2Lobby',
  'GetLolLobbyV2LobbyMembers',
  'GetLolMatchHistoryV1GamesByGameId',
  'PostLolLobbyV1CustomGamesByIdJoin',
  'PostLolLobbyV1LobbyCustomStartChampSelect',
  'PostLolLobbyV2Lobby',
] as const;

interface LcuHelp {
  functions: Record<string, unknown>;
}

interface GameTypeConfig {
  id: number;
  [key: string]: unknown;
}

interface QueueDefinition {
  id: number;
  gameMode: string;
  mapId: number;
  numPlayersPerTeam: number;
  gameTypeConfig: GameTypeConfig;
}

interface CustomQueueCatalog {
  subcategories: Array<{
    gameMode: string;
    mapId: number;
    numPlayersPerTeam: number;
    mutators: GameTypeConfig[];
  }>;
}

interface LobbyParticipant {
  allowedStartActivity: boolean;
  isBot: boolean;
  isLeader: boolean;
  isSpectator: boolean;
}

interface LobbyDto {
  partyId: string;
  canStartActivity: boolean;
  localMember: LobbyParticipant;
  members: LobbyParticipant[];
  gameConfig: {
    customLobbyName?: string;
    customTeam100?: unknown[];
    customTeam200?: unknown[];
    isCustom?: boolean;
  };
}

interface ListedCustomGame {
  id: number;
  lobbyName: string;
}

interface StartChampSelectResponse {
  success: boolean;
  failedPlayers: unknown[];
}

interface GameflowSession {
  gameData?: { gameId?: number };
}

export function isManagedTestLobbyName(
  lobbyName: string | undefined,
  mode: 'BOTS' | 'DUEL',
): boolean {
  if (!lobbyName) return false;
  const suffix = mode === 'DUEL' ? 'DUEL-' : 'BOTS-';
  return lobbyName.startsWith(`PINKWARD-${suffix}`) || lobbyName.startsWith(`W3C-${suffix}`);
}

export function duelTeamBalanceAction(
  teamOneCount: number,
  teamTwoCount: number,
): 'BALANCED' | 'TEAM1' | 'TEAM2' | 'INVALID' {
  if (teamOneCount === 1 && teamTwoCount === 1) return 'BALANCED';
  if (teamOneCount === 2 && teamTwoCount === 0) return 'TEAM2';
  if (teamOneCount === 0 && teamTwoCount === 2) return 'TEAM1';
  return 'INVALID';
}

const commandResult = (
  status: AdapterCommandResult['status'],
  diagnosticCode: string,
  gameflowState: LeagueClientState,
  automated: boolean,
  externalLobbyId?: string,
): AdapterCommandResult => ({
  status,
  successful: status === 'SUCCESS',
  automated,
  diagnosticCode,
  gameflowState,
  ...(externalLobbyId ? { externalLobbyId } : {}),
});

export class LocalLeagueClientAdapter implements LeagueClientAdapter {
  private installationDirectory: string | null = null;

  setInstallationDirectory(directory: string | null): void {
    this.installationDirectory = directory ? path.resolve(directory) : null;
  }

  getInstallationDirectory(): string | null {
    return this.installationDirectory;
  }

  async getStatus(): Promise<LeagueStatusSnapshot> {
    const executable = await this.findExecutable();
    try {
      const client = await LcuHttpClient.connect(this.installationDirectory);
      const [phase, help] = await Promise.all([
        client.get<string>('/lol-gameflow/v1/gameflow-phase'),
        client.get<LcuHelp>('/help'),
      ]);
      const automationAvailable = REQUIRED_FUNCTIONS.every((name) =>
        Object.hasOwn(help.functions ?? {}, name),
      );
      const state = mapGameflowState(phase);
      const gameId = state === 'CHAMP_SELECT' || state === 'IN_GAME'
        ? await this.currentGameId(client)
        : undefined;
      return {
        installed: true,
        running: true,
        state,
        adapterHealthy: automationAvailable,
        automationAvailable,
        observedAt: new Date().toISOString(),
        detail: automationAvailable
          ? 'Verified local LCU contract is available.'
          : 'League is connected, but one or more required LCU operations are unavailable.',
        ...(gameId === undefined ? {} : { gameId }),
      };
    } catch (error) {
      const diagnostic = error instanceof LcuHttpError ? error.diagnosticCode : 'LCU_STATUS_FAILED';
      const notRunning = diagnostic === 'LCU_PROCESS_NOT_RUNNING';
      return {
        installed: executable !== null,
        running: !notRunning,
        state: executable === null ? 'NOT_INSTALLED' : notRunning ? 'NOT_RUNNING' : 'UNKNOWN',
        adapterHealthy: false,
        automationAvailable: false,
        observedAt: new Date().toISOString(),
        detail: executable === null
          ? 'League installation was not found in configured or common locations.'
          : notRunning
            ? 'League installation detected; client is not running.'
            : `League LCU connection unavailable (${diagnostic}).`,
      };
    }
  }

  async getIdentity(): Promise<LeagueIdentitySnapshot | null> {
    try {
      const client = await LcuHttpClient.connect(this.installationDirectory);
      const session = await client.get<unknown>('/lol-login/v1/session');
      const [summoner, regionLocale] = await Promise.all([
        client.get<unknown>('/lol-summoner/v1/current-summoner'),
        client.get<unknown>('/riotclient/region-locale'),
      ]);
      const identity = parseLeagueIdentity(session, summoner, regionLocale);
      if (!identity || identity.profileIconId === undefined) return identity;
      try {
        const profileIconDataUrl = await client.getImageDataUrl(
          `/lol-game-data/assets/v1/profile-icons/${identity.profileIconId}.jpg`,
        );
        return { ...identity, profileIconDataUrl };
      } catch {
        return identity;
      }
    } catch {
      return null;
    }
  }

  async getGameResult(gameId: number): Promise<LeagueGameResultSnapshot | null> {
    if (!Number.isSafeInteger(gameId) || gameId <= 0) return null;
    try {
      const client = await this.verifiedClient();
      const game = await client.get<unknown>(`/lol-match-history/v1/games/${gameId}`);
      return parseLeagueGameResult(game, gameId);
    } catch (error) {
      if (error instanceof LcuHttpError && error.statusCode === 404) return null;
      throw error;
    }
  }

  async createCustomLobby(configuration: CustomLobbyConfiguration): Promise<AdapterCommandResult> {
    if (
      !configuration.name.trim() ||
      !configuration.password ||
      (configuration.expectedPlayers !== 2 && configuration.expectedPlayers !== 10) ||
      (configuration.map && configuration.map !== 'SUMMONERS_RIFT')
    ) {
      return commandResult('FAILED', 'LCU_CREATE_CONFIGURATION_REJECTED', 'UNKNOWN', false);
    }

    try {
      const client = await this.verifiedClient();
      const phase = await this.phase(client);
      const existing = await this.currentLobby(client);
      if (existing) {
        if (existing.gameConfig.customLobbyName === configuration.name) {
          return commandResult('SUCCESS', 'LCU_LOBBY_ALREADY_CREATED', 'LOBBY', true, existing.partyId);
        }
        return commandResult('FAILED', 'LCU_ALREADY_IN_DIFFERENT_LOBBY', mapGameflowState(phase), true);
      }
      if (phase !== 'None') {
        return commandResult('FAILED', 'LCU_NOT_IDLE_FOR_LOBBY_CREATION', mapGameflowState(phase), true);
      }

      const [queue, catalog] = await Promise.all([
        client.get<QueueDefinition>(`/lol-game-queues/v1/queues/${CUSTOM_QUEUE_ID}`),
        client.get<CustomQueueCatalog>('/lol-game-queues/v1/custom'),
      ]);
      const subcategory = catalog.subcategories.find(
        (candidate) =>
          candidate.mapId === SUMMONERS_RIFT_MAP_ID && candidate.gameMode === queue.gameMode,
      );
      const mutator = subcategory?.mutators.find((candidate) => candidate.id === queue.id);
      if (
        queue.id !== CUSTOM_QUEUE_ID ||
        queue.mapId !== SUMMONERS_RIFT_MAP_ID ||
        queue.numPlayersPerTeam !== 5 ||
        !subcategory ||
        !mutator
      ) {
        return commandResult('UNSUPPORTED', 'LCU_CUSTOM_QUEUE_CONTRACT_CHANGED', mapGameflowState(phase), true);
      }

      const payload = {
        queueId: queue.id,
        customGameLobby: {
          lobbyName: configuration.name,
          lobbyPassword: configuration.password,
          configuration: {
            mapId: queue.mapId,
            gameMode: queue.gameMode,
            mutators: mutator,
            gameTypeConfig: queue.gameTypeConfig,
            spectatorPolicy: 'AllAllowed',
            teamSize: configuration.expectedPlayers / 2,
            maxPlayerCount: configuration.expectedPlayers,
            tournamentGameMode: '',
            tournamentPassbackUrl: '',
            tournamentPassbackDataPacket: '',
            gameServerRegion: '',
            spectatorDelayEnabled: false,
            hidePublicly: false,
            aramMapMutator: '',
          },
          teamOne: [],
          teamTwo: [],
          spectators: [],
          practiceGameRewardsDisabledReasons: [],
          gameId: 0,
        },
      };
      const lobby = await client.post<LobbyDto>('/lol-lobby/v2/lobby', payload);
      return commandResult('SUCCESS', 'LCU_LOBBY_CREATED', 'LOBBY', true, lobby.partyId);
    } catch (error) {
      return this.failedCommand(error, 'LCU_CREATE_FAILED');
    }
  }

  async createBotLobby(configuration: BotLobbyConfiguration): Promise<AdapterCommandResult> {
    if (configuration.playerRole === configuration.secondaryRole) {
      return commandResult('FAILED', 'LCU_TEST_ROLES_NOT_DISTINCT', 'UNKNOWN', false);
    }
    const created = await this.createCustomLobby(configuration);
    if (!created.successful || created.status !== 'SUCCESS') return created;

    try {
      const client = await this.verifiedClient();
      await client.put<unknown>(
        '/lol-lobby/v2/lobby/members/localMember/position-preferences',
        {
          firstPreference: positionForRole(configuration.playerRole),
          secondPreference: positionForRole(configuration.secondaryRole),
        },
      );
      const available = await client.get<Array<{ id?: number; botDifficulties?: string[] }>>(
        '/lol-lobby/v2/lobby/custom/available-bots',
      );
      const plan = botPlanForRole(configuration.playerRole);
      const supported = plan.every((bot) => available.some(
        (candidate) => candidate.id === bot.championId &&
          candidate.botDifficulties?.includes('RSBEGINNER'),
      ));
      if (!supported) {
        return commandResult('UNSUPPORTED', 'LCU_TEST_BOT_ROSTER_UNAVAILABLE', 'LOBBY', true);
      }
      for (const bot of plan) {
        await client.post<unknown>('/lol-lobby/v1/lobby/custom/bots', {
          championId: bot.championId,
          botDifficulty: 'RSBEGINNER',
          teamId: String(bot.teamId),
          position: bot.position,
          botUuid: '',
        });
      }
      return commandResult(
        'SUCCESS',
        'LCU_TEST_LOBBY_WITH_BOTS_CREATED',
        'LOBBY',
        true,
        created.externalLobbyId,
      );
    } catch (error) {
      return this.failedCommand(error, 'LCU_TEST_BOT_FILL_FAILED');
    }
  }

  async joinCustomLobby(credentials: LobbyCredentials): Promise<AdapterCommandResult> {
    if (!credentials.name.trim() || !credentials.password) {
      return commandResult('FAILED', 'LCU_JOIN_CREDENTIALS_REJECTED', 'UNKNOWN', false);
    }

    try {
      const client = await this.verifiedClient();
      const phase = await this.phase(client);
      const existing = await this.currentLobby(client);
      if (existing) {
        if (existing.gameConfig.customLobbyName === credentials.name) {
          return commandResult('SUCCESS', 'LCU_LOBBY_ALREADY_JOINED', 'LOBBY', true, existing.partyId);
        }
        return commandResult('FAILED', 'LCU_ALREADY_IN_DIFFERENT_LOBBY', mapGameflowState(phase), true);
      }
      if (phase !== 'None') {
        return commandResult('FAILED', 'LCU_NOT_IDLE_FOR_LOBBY_JOIN', mapGameflowState(phase), true);
      }

      if (credentials.partyId) {
        try {
          await client.post<unknown>(
            `/lol-lobby/v2/party/${encodeURIComponent(credentials.partyId)}/join`,
            { lobbyPassword: credentials.password },
          );
          const joinedDirectly = await this.observeJoinedLobby(client, credentials.name);
          if (joinedDirectly) {
            return commandResult(
              'SUCCESS',
              'LCU_LOBBY_JOINED_BY_PARTY_ID',
              'LOBBY',
              true,
              joinedDirectly.partyId,
            );
          }
        } catch (error) {
          if (!(error instanceof LcuHttpError) || ![400, 404].includes(error.statusCode)) throw error;
        }
      }

      await client.post<unknown>('/lol-lobby/v1/custom-games/refresh');
      const games = await client.get<ListedCustomGame[]>('/lol-lobby/v1/custom-games');
      const matching = games.filter((game) => game.lobbyName === credentials.name);
      if (matching.length === 0) {
        return commandResult('UNKNOWN', 'LCU_LOBBY_NOT_DISCOVERED', 'CONNECTED', true);
      }
      if (matching.length > 1) {
        return commandResult('FAILED', 'LCU_LOBBY_NAME_AMBIGUOUS', 'CONNECTED', true);
      }
      await client.post<unknown>(`/lol-lobby/v1/custom-games/${matching[0].id}/join`, {
        password: credentials.password,
        asSpectator: false,
      });
      const joined = await this.currentLobby(client);
      if (!joined || joined.gameConfig.customLobbyName !== credentials.name) {
        return commandResult('UNKNOWN', 'LCU_JOIN_NOT_OBSERVED', 'UNKNOWN', true);
      }
      return commandResult('SUCCESS', 'LCU_LOBBY_JOINED', 'LOBBY', true, joined.partyId);
    } catch (error) {
      return this.failedCommand(error, 'LCU_JOIN_FAILED');
    }
  }

  async startGame(): Promise<AdapterCommandResult> {
    return this.startValidatedGame('HUMAN_5V5');
  }

  async balanceDuelTeams(): Promise<AdapterCommandResult> {
    try {
      const client = await this.verifiedClient();
      const phase = await this.phase(client);
      const lobby = await this.currentLobby(client);
      if (
        phase !== 'Lobby' ||
        !lobby ||
        lobby.gameConfig.isCustom !== true ||
        !isManagedTestLobbyName(lobby.gameConfig.customLobbyName, 'DUEL')
      ) {
        return commandResult('FAILED', 'LCU_DUEL_LOBBY_NOT_ACTIVE', mapGameflowState(phase), true);
      }

      const action = duelTeamBalanceAction(
        lobby.gameConfig.customTeam100?.length ?? 0,
        lobby.gameConfig.customTeam200?.length ?? 0,
      );
      if (action === 'BALANCED') {
        return commandResult('SUCCESS', 'LCU_DUEL_TEAMS_ALREADY_BALANCED', 'LOBBY', true);
      }
      if (action === 'INVALID') {
        return commandResult('FAILED', 'LCU_DUEL_ROSTER_INVALID', 'LOBBY', true);
      }

      await client.post<unknown>(`/lol-lobby/v2/lobby/team/${action}`);
      for (let attempt = 0; attempt < 12; attempt += 1) {
        const updated = await this.currentLobby(client);
        if (
          updated &&
          duelTeamBalanceAction(
            updated.gameConfig.customTeam100?.length ?? 0,
            updated.gameConfig.customTeam200?.length ?? 0,
          ) === 'BALANCED'
        ) {
          return commandResult('SUCCESS', 'LCU_DUEL_TEAMS_BALANCED', 'LOBBY', true);
        }
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
      return commandResult('UNKNOWN', 'LCU_DUEL_TEAM_SWITCH_NOT_OBSERVED', 'LOBBY', true);
    } catch (error) {
      return this.failedCommand(error, 'LCU_DUEL_TEAM_SWITCH_FAILED');
    }
  }

  async startDuelGame(): Promise<AdapterCommandResult> {
    return this.startValidatedGame('DUEL');
  }

  async startBotGame(): Promise<AdapterCommandResult> {
    return this.startValidatedGame('BOTS');
  }

  async setPositionPreferences(
    primaryRole: BotFillRole,
    secondaryRole: BotFillRole,
  ): Promise<AdapterCommandResult> {
    if (primaryRole === secondaryRole) {
      return commandResult('FAILED', 'LCU_ROLES_NOT_DISTINCT', 'UNKNOWN', false);
    }
    try {
      const client = await this.verifiedClient();
      await client.put<unknown>(
        '/lol-lobby/v2/lobby/members/localMember/position-preferences',
        {
          firstPreference: positionForRole(primaryRole),
          secondPreference: positionForRole(secondaryRole),
        },
      );
      return commandResult('SUCCESS', 'LCU_POSITION_PREFERENCES_SET', 'LOBBY', true);
    } catch (error) {
      return this.failedCommand(error, 'LCU_POSITION_PREFERENCES_FAILED');
    }
  }

  private async startValidatedGame(mode: 'HUMAN_5V5' | 'BOTS' | 'DUEL'): Promise<AdapterCommandResult> {
    try {
      const client = await this.verifiedClient();
      const phase = await this.phase(client);
      if (phase === 'ChampSelect' || phase === 'InProgress') {
        return commandResult('SUCCESS', 'LCU_GAME_ALREADY_STARTED', mapGameflowState(phase), true);
      }
      const lobby = await this.currentLobby(client);
      if (!lobby || phase !== 'Lobby') {
        return commandResult('FAILED', 'LCU_CUSTOM_LOBBY_NOT_ACTIVE', mapGameflowState(phase), true);
      }
      const members = await client.get<LobbyParticipant[]>('/lol-lobby/v2/lobby/members');
      const teamOneCount = lobby.gameConfig.customTeam100?.length ?? 0;
      const teamTwoCount = lobby.gameConfig.customTeam200?.length ?? 0;
      const humanLobbyEligible =
        lobby.gameConfig.isCustom === true &&
        lobby.canStartActivity &&
        lobby.localMember.isLeader &&
        lobby.localMember.allowedStartActivity &&
        members.length === 10 &&
        members.every((member) => !member.isBot && !member.isSpectator) &&
        teamOneCount === 5 &&
        teamTwoCount === 5;
      const botLobbyEligible =
        mode === 'BOTS' &&
        lobby.gameConfig.isCustom === true &&
        isManagedTestLobbyName(lobby.gameConfig.customLobbyName, 'BOTS') &&
        lobby.canStartActivity &&
        lobby.localMember.isLeader &&
        lobby.localMember.allowedStartActivity &&
        members.length === 1 &&
        members.every((member) => !member.isBot && !member.isSpectator) &&
        teamOneCount === 5 &&
        teamTwoCount === 5;
      const duelLobbyEligible =
        mode === 'DUEL' &&
        lobby.gameConfig.isCustom === true &&
        isManagedTestLobbyName(lobby.gameConfig.customLobbyName, 'DUEL') &&
        lobby.canStartActivity &&
        lobby.localMember.isLeader &&
        lobby.localMember.allowedStartActivity &&
        members.length === 2 &&
        members.every((member) => !member.isBot && !member.isSpectator) &&
        teamOneCount === 1 &&
        teamTwoCount === 1;
      const eligible = mode === 'BOTS'
        ? botLobbyEligible
        : mode === 'DUEL'
          ? duelLobbyEligible
          : humanLobbyEligible;
      if (!eligible) {
        return commandResult(
          'FAILED',
          mode === 'DUEL' ? 'LCU_LOBBY_NOT_VALIDATED_1V1' : 'LCU_LOBBY_NOT_VALIDATED_5V5',
          'LOBBY',
          true,
        );
      }

      const response = await client.post<StartChampSelectResponse>(
        '/lol-lobby/v1/lobby/custom/start-champ-select',
      );
      if (!response.success || response.failedPlayers.length > 0) {
        return commandResult('FAILED', 'LCU_CHAMP_SELECT_REJECTED', 'LOBBY', true);
      }
      const observedPhase = await this.observeStartedPhase(client);
      return commandResult('SUCCESS', 'LCU_CHAMP_SELECT_STARTED', mapGameflowState(observedPhase), true);
    } catch (error) {
      return this.failedCommand(error, 'LCU_START_FAILED');
    }
  }

  async openLeague(): Promise<{ opened: boolean; reason?: string }> {
    if (await runningInstallationDirectory()) return { opened: true };

    const leagueExecutable = await this.findExecutable();
    if (!leagueExecutable) return { opened: false, reason: 'LeagueClient.exe was not found.' };
    const riotClient = await this.findRiotClientExecutable(leagueExecutable);
    if (!riotClient) {
      return { opened: false, reason: 'RiotClientServices.exe was not found next to League.' };
    }

    try {
      await this.launchThroughRiotClientApi();
    } catch (error) {
      if (!this.isRiotClientUnavailable(error)) {
        return { opened: false, reason: this.riotLaunchFailureReason(error) };
      }

      const spawned = await new Promise<{ opened: boolean; reason?: string }>((resolve) => {
        const process = spawn(
          riotClient,
          ['--launch-product=league_of_legends', '--launch-patchline=live'],
          {
            cwd: path.dirname(riotClient),
            detached: true,
            stdio: 'ignore',
            windowsHide: false,
          },
        );
        process.once('error', (error) => resolve({ opened: false, reason: error.message }));
        process.once('spawn', () => {
          process.unref();
          resolve({ opened: true });
        });
      });
      if (!spawned.opened) return spawned;

      let apiReady = false;
      for (let attempt = 0; attempt < 60; attempt += 1) {
        if (await runningInstallationDirectory()) return { opened: true };
        try {
          await this.launchThroughRiotClientApi();
          apiReady = true;
          break;
        } catch (apiError) {
          if (
            apiError instanceof RiotClientHttpError &&
            (apiError.diagnosticCode === 'RIOT_CLIENT_CONNECTION_FAILED' ||
              apiError.diagnosticCode === 'RIOT_CLIENT_LOCKFILE_NOT_FOUND')
          ) {
            await delay(500);
            continue;
          }
          return { opened: false, reason: this.riotLaunchFailureReason(apiError) };
        }
      }
      if (!apiReady) {
        return { opened: false, reason: 'Riot Client opened but did not become ready.' };
      }
    }

    for (let attempt = 0; attempt < 60; attempt += 1) {
      if (await runningInstallationDirectory()) return { opened: true };
      await delay(500);
    }
    return {
      opened: false,
      reason: 'Riot Client accepted the launch, but League did not start within 30 seconds.',
    };
  }

  private async launchThroughRiotClientApi(): Promise<void> {
    const client = await RiotClientHttpClient.connect();
    if (!(await client.isLeagueLaunchEligible())) {
      throw new RiotClientHttpError(409, 'RIOT_CLIENT_LEAGUE_NOT_ELIGIBLE');
    }
    await client.launchLeague();
  }

  private riotLaunchFailureReason(error: unknown): string {
    if (!(error instanceof RiotClientHttpError)) return 'League could not be launched.';
    if (error.diagnosticCode === 'RIOT_CLIENT_LEAGUE_NOT_ELIGIBLE') {
      return 'Sign in to Riot Client and finish any required update before opening League.';
    }
    if (error.statusCode === 401 || error.statusCode === 403) {
      return 'Riot Client is not ready to launch League. Sign in, then try again.';
    }
    return `Riot Client could not launch League (${error.diagnosticCode}).`;
  }

  private isRiotClientUnavailable(error: unknown): boolean {
    return error instanceof RiotClientHttpError && (
      error.diagnosticCode === 'RIOT_CLIENT_CONNECTION_FAILED' ||
      error.diagnosticCode === 'RIOT_CLIENT_LOCKFILE_NOT_FOUND'
    );
  }

  private async verifiedClient(): Promise<LcuHttpClient> {
    const client = await LcuHttpClient.connect(this.installationDirectory);
    const help = await client.get<LcuHelp>('/help');
    if (!REQUIRED_FUNCTIONS.every((name) => Object.hasOwn(help.functions ?? {}, name))) {
      throw new LcuHttpError(0, 'LCU_REQUIRED_CONTRACT_UNAVAILABLE');
    }
    return client;
  }

  private async currentLobby(client: LcuHttpClient): Promise<LobbyDto | null> {
    try {
      return await client.get<LobbyDto>('/lol-lobby/v2/lobby');
    } catch (error) {
      if (error instanceof LcuHttpError && error.statusCode === 404) return null;
      throw error;
    }
  }

  private async observeJoinedLobby(
    client: LcuHttpClient,
    expectedName: string,
  ): Promise<LobbyDto | null> {
    for (let attempt = 0; attempt < 12; attempt += 1) {
      const lobby = await this.currentLobby(client);
      if (lobby?.gameConfig.customLobbyName === expectedName) return lobby;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    return this.currentLobby(client);
  }

  private phase(client: LcuHttpClient): Promise<string> {
    return client.get<string>('/lol-gameflow/v1/gameflow-phase');
  }

  private async currentGameId(client: LcuHttpClient): Promise<number | undefined> {
    try {
      const session = await client.get<GameflowSession>('/lol-gameflow/v1/session');
      const gameId = session.gameData?.gameId;
      return Number.isSafeInteger(gameId) && (gameId ?? 0) > 0 ? gameId : undefined;
    } catch (error) {
      if (error instanceof LcuHttpError && error.statusCode === 404) return undefined;
      throw error;
    }
  }

  private async observeStartedPhase(client: LcuHttpClient): Promise<string> {
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const phase = await this.phase(client);
      if (phase === 'ChampSelect' || phase === 'InProgress') return phase;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    return this.phase(client);
  }

  private failedCommand(error: unknown, fallbackCode: string): AdapterCommandResult {
    const diagnostic = error instanceof LcuHttpError ? error.diagnosticCode : fallbackCode;
    const status = error instanceof LcuHttpError && error.statusCode === 404 ? 'UNKNOWN' : 'FAILED';
    return commandResult(status, diagnostic, 'UNKNOWN', true);
  }

  private async findExecutable(): Promise<string | null> {
    const installedDirectories = await installedLeagueDirectories();
    const runningDirectory = installedDirectories.length === 0
      ? await runningInstallationDirectory()
      : null;
    const configuredPath = process.env.W3C_LEAGUE_PATH;
    const candidates = [
      this.installationDirectory
        ? path.join(this.installationDirectory, 'LeagueClient.exe')
        : undefined,
      runningDirectory ? path.join(runningDirectory, 'LeagueClient.exe') : undefined,
      configuredPath,
      ...installedDirectories.map((directory) => path.join(directory, 'LeagueClient.exe')),
      path.join(process.env.SystemDrive ?? 'C:', 'Riot Games', 'League of Legends', 'LeagueClient.exe'),
      process.env.ProgramFiles
        ? path.join(process.env.ProgramFiles, 'Riot Games', 'League of Legends', 'LeagueClient.exe')
        : undefined,
    ].filter((candidate): candidate is string => Boolean(candidate));

    for (const candidate of candidates) {
      if (path.basename(candidate).toLowerCase() !== 'leagueclient.exe') continue;
      try {
        await access(candidate);
        return path.resolve(candidate);
      } catch {
        // Try the next explicit or discovered location.
      }
    }
    return null;
  }

  private async findRiotClientExecutable(leagueExecutable: string): Promise<string | null> {
    const leagueRoot = path.dirname(path.dirname(leagueExecutable));
    const candidates = [
      process.env.W3C_RIOT_CLIENT_PATH,
      path.join(leagueRoot, 'Riot Client', 'RiotClientServices.exe'),
      path.join(process.env.SystemDrive ?? 'C:', 'Riot Games', 'Riot Client', 'RiotClientServices.exe'),
      process.env.ProgramFiles
        ? path.join(process.env.ProgramFiles, 'Riot Games', 'Riot Client', 'RiotClientServices.exe')
        : undefined,
    ].filter((candidate): candidate is string => Boolean(candidate));

    for (const candidate of candidates) {
      if (path.basename(candidate).toLowerCase() !== 'riotclientservices.exe') continue;
      try {
        await access(candidate);
        return path.resolve(candidate);
      } catch {
        // Try the next explicit or League-relative Riot Client location.
      }
    }
    return null;
  }
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function mapGameflowState(phase: string): LeagueClientState {
  switch (phase) {
    case 'Lobby':
      return 'LOBBY';
    case 'ChampSelect':
      return 'CHAMP_SELECT';
    case 'InProgress':
    case 'Reconnect':
      return 'IN_GAME';
    case 'None':
    case 'EndOfGame':
    case 'PreEndOfGame':
    case 'WaitingForStats':
      return 'CONNECTED';
    default:
      return 'UNKNOWN';
  }
}
