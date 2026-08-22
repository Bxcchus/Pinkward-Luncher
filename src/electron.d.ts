import type {
  LeagueClientState,
  LeagueDuelFirstBlood,
  LeagueGameResult,
  LeagueIdentity,
  LeagueStatus,
  LobbyCredentials,
} from './domain/types';

interface AdapterCommandResult {
  status: 'SUCCESS' | 'FAILED' | 'UNSUPPORTED' | 'UNKNOWN';
  successful: boolean;
  automated: boolean;
  diagnosticCode: string;
  externalLobbyId?: string;
  gameflowState: LeagueClientState;
}

declare global {
  interface AppUpdateSnapshot {
    status: 'UNAVAILABLE' | 'IDLE' | 'CHECKING' | 'UP_TO_DATE' | 'DOWNLOADING' | 'READY' | 'ERROR';
    currentVersion: string;
    availableVersion?: string;
    progressPercent?: number;
    message: string;
  }

  interface Window {
    w3c?: {
      platform: string;
      window: {
        minimize(): void;
        toggleMaximize(): void;
        close(): void;
      };
      league: {
        getInstallationPath(): Promise<string | null>;
        selectInstallationPath(): Promise<{ path: string | null; selected: boolean; error?: string }>;
        getStatus(): Promise<LeagueStatus>;
        getIdentity(): Promise<LeagueIdentity | null>;
        getGameResult(gameId: number): Promise<LeagueGameResult | null>;
        getDuelFirstBlood(): Promise<LeagueDuelFirstBlood | null>;
        createCustomLobby(configuration: LobbyCredentials & {
          region: string;
          expectedPlayers: number;
          ruleset: 'DUEL_ARAM' | 'TOURNAMENT_DRAFT_5V5' | 'BOT_TEST_5V5';
        }): Promise<AdapterCommandResult>;
        createBotLobby(configuration: LobbyCredentials & {
          region: string;
          expectedPlayers: number;
          ruleset: 'BOT_TEST_5V5';
          playerRole: import('./domain/types').Role;
          secondaryRole: import('./domain/types').Role;
        }): Promise<AdapterCommandResult>;
        joinCustomLobby(credentials: LobbyCredentials): Promise<AdapterCommandResult>;
        balanceDuelTeams(): Promise<AdapterCommandResult>;
        startGame(): Promise<AdapterCommandResult>;
        startDuelGame(): Promise<AdapterCommandResult>;
        exitDuelGame(): Promise<AdapterCommandResult>;
        startBotGame(): Promise<AdapterCommandResult>;
        setPositionPreferences(
          primaryRole: import('./domain/types').Role,
          secondaryRole: import('./domain/types').Role,
        ): Promise<AdapterCommandResult>;
        openLeague(): Promise<{ opened: boolean; reason?: string }>;
      };
      updater: {
        getStatus(): Promise<AppUpdateSnapshot>;
        check(): Promise<AppUpdateSnapshot>;
        install(): Promise<boolean>;
        onStatus(listener: (snapshot: AppUpdateSnapshot) => void): () => void;
      };
    };
  }
}

export {};
