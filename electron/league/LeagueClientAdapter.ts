import type {
  AdapterCommandResult,
  BotLobbyConfiguration,
  BotFillRole,
  CustomLobbyConfiguration,
  LeagueGameResultSnapshot,
  LeagueIdentitySnapshot,
  LeagueStatusSnapshot,
  LobbyCredentials,
} from './types.js';

export interface LeagueClientAdapter {
  getStatus(): Promise<LeagueStatusSnapshot>;
  getIdentity(): Promise<LeagueIdentitySnapshot | null>;
  getGameResult(gameId: number): Promise<LeagueGameResultSnapshot | null>;
  createCustomLobby(configuration: CustomLobbyConfiguration): Promise<AdapterCommandResult>;
  createBotLobby(configuration: BotLobbyConfiguration): Promise<AdapterCommandResult>;
  joinCustomLobby(credentials: LobbyCredentials): Promise<AdapterCommandResult>;
  balanceDuelTeams(): Promise<AdapterCommandResult>;
  startGame(): Promise<AdapterCommandResult>;
  startDuelGame(): Promise<AdapterCommandResult>;
  startBotGame(): Promise<AdapterCommandResult>;
  setPositionPreferences(
    primaryRole: BotFillRole,
    secondaryRole: BotFillRole,
  ): Promise<AdapterCommandResult>;
  openLeague(): Promise<{ opened: boolean; reason?: string }>;
}
