import type {
  LeagueClientState,
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
  interface Window {
    w3c?: {
      platform: string;
      auth: {
        getAccessCode(): Promise<string | null>;
        saveAccessCode(accessCode: string): Promise<void>;
      };
      league: {
        getInstallationPath(): Promise<string | null>;
        selectInstallationPath(): Promise<{ path: string | null; selected: boolean; error?: string }>;
        getStatus(): Promise<LeagueStatus>;
        getIdentity(): Promise<LeagueIdentity | null>;
        getGameResult(gameId: number): Promise<LeagueGameResult | null>;
        createCustomLobby(configuration: LobbyCredentials & {
          region: string;
          map?: string;
          expectedPlayers: number;
        }): Promise<AdapterCommandResult>;
        createBotLobby(configuration: LobbyCredentials & {
          region: string;
          map?: string;
          expectedPlayers: number;
          playerRole: import('./domain/types').Role;
          secondaryRole: import('./domain/types').Role;
        }): Promise<AdapterCommandResult>;
        joinCustomLobby(credentials: LobbyCredentials): Promise<AdapterCommandResult>;
        startGame(): Promise<AdapterCommandResult>;
        startDuelGame(): Promise<AdapterCommandResult>;
        startBotGame(): Promise<AdapterCommandResult>;
        setPositionPreferences(
          primaryRole: import('./domain/types').Role,
          secondaryRole: import('./domain/types').Role,
        ): Promise<AdapterCommandResult>;
        openLeague(): Promise<{ opened: boolean; reason?: string }>;
      };
    };
  }
}

export {};
