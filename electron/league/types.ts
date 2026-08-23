export type LeagueClientState =
  | 'NOT_INSTALLED'
  | 'NOT_RUNNING'
  | 'STARTING'
  | 'CONNECTED'
  | 'LOBBY'
  | 'CHAMP_SELECT'
  | 'IN_GAME'
  | 'UNKNOWN';

export interface LeagueStatusSnapshot {
  installed: boolean;
  running: boolean;
  state: LeagueClientState;
  adapterHealthy: boolean;
  automationAvailable: boolean;
  observedAt: string;
  detail: string;
  gameId?: number;
}

export interface LeagueGameResultSnapshot {
  gameId: number;
  outcome: 'BLUE_WIN' | 'RED_WIN' | 'UNKNOWN';
  diagnosticCode: string;
  durationSeconds?: number;
  score?: string;
}

export type DuelWinCondition = 'FIRST_BLOOD' | 'CREEP_SCORE_100' | 'FIRST_TURRET';

export interface DuelVictorySnapshot {
  condition: DuelWinCondition;
  eventId?: number;
  eventTimeSeconds: number;
  winnerName: string;
  loserName: string;
  winnerValue: number;
  loserValue: number;
  localPlayerWon: boolean;
}

export interface LeagueIdentitySnapshot {
  riotPuuid: string;
  gameName: string;
  tagLine: string;
  region: string;
  profileIconId?: number;
  profileIconDataUrl?: string;
}

export interface LobbyCredentials {
  name: string;
  password: string;
  partyId?: string;
}

export type CustomLobbyRuleset =
  | 'DUEL_ARAM'
  | 'TOURNAMENT_DRAFT_5V5'
  | 'BOT_TEST_5V5';

export interface CustomLobbyConfiguration extends LobbyCredentials {
  region: string;
  expectedPlayers: number;
  ruleset: CustomLobbyRuleset;
}

export type BotFillRole = 'TOP' | 'JUNGLE' | 'MID' | 'ADC' | 'SUPPORT';

export interface BotLobbyConfiguration extends CustomLobbyConfiguration {
  playerRole: BotFillRole;
  secondaryRole: BotFillRole;
}

export interface AdapterCommandResult {
  status: 'SUCCESS' | 'FAILED' | 'UNSUPPORTED' | 'UNKNOWN';
  successful: boolean;
  automated: boolean;
  diagnosticCode: string;
  externalLobbyId?: string;
  gameflowState: LeagueClientState;
}
