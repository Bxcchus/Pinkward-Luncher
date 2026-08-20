import type { LobbyCredentials } from '../domain/types';
import type {
  ClientEvent,
  LeagueOperationStatus,
  ServerEvent,
  WireLobbyCredentials,
} from './webSocketClient';

export interface LeagueAdapterResult {
  status: LeagueOperationStatus;
  successful: boolean;
  automated: boolean;
  diagnosticCode: string;
  externalLobbyId?: string;
  gameflowState: string;
}

interface CustomLobbyRequest extends LobbyCredentials {
  region: string;
  expectedPlayers: number;
}

export interface LeagueCommandAdapter {
  createCustomLobby(configuration: CustomLobbyRequest): Promise<LeagueAdapterResult>;
  joinCustomLobby(credentials: LobbyCredentials): Promise<LeagueAdapterResult>;
  startGame(): Promise<LeagueAdapterResult>;
}

export type LeagueServerCommand = Extract<
  ServerEvent,
  { type: 'CREATE_LOBBY' | 'JOIN_LOBBY' | 'START_GAME' }
>;

export interface CommandExecutionResult {
  acknowledgement: ClientEvent;
  fallbackRequired: boolean;
  fallbackMessage?: string;
  lobby?: LobbyCredentials;
}

const bridgeUnavailableResult: LeagueAdapterResult = {
  status: 'UNKNOWN',
  successful: false,
  automated: false,
  diagnosticCode: 'ELECTRON_BRIDGE_UNAVAILABLE',
  gameflowState: 'UNKNOWN',
};

export function toLobbyCredentials(credentials: WireLobbyCredentials): LobbyCredentials {
  return {
    name: credentials.lobbyName ?? credentials.name ?? 'UNKNOWN',
    password: credentials.password,
  };
}

async function safelyRunAdapter(
  operation: (() => Promise<LeagueAdapterResult>) | undefined,
): Promise<LeagueAdapterResult> {
  if (!operation) return bridgeUnavailableResult;
  try {
    return await operation();
  } catch {
    return {
      status: 'FAILED',
      successful: false,
      automated: false,
      diagnosticCode: 'LEAGUE_ADAPTER_EXECUTION_FAILED',
      gameflowState: 'UNKNOWN',
    };
  }
}

const failedStatus = (result: LeagueAdapterResult): 'FAILED' | 'UNSUPPORTED' | 'UNKNOWN' =>
  result.status === 'SUCCESS' ? 'UNKNOWN' : result.status;

export async function handleLeagueCommand(
  event: LeagueServerCommand,
  adapter?: LeagueCommandAdapter,
  observedAt = () => new Date().toISOString(),
): Promise<CommandExecutionResult> {
  switch (event.type) {
    case 'CREATE_LOBBY': {
      const { commandId, matchId, configuration } = event.payload;
      const lobby = toLobbyCredentials(configuration.credentials);
      const result = await safelyRunAdapter(
        adapter
          ? () =>
              adapter.createCustomLobby({
                ...lobby,
                region: configuration.region,
                expectedPlayers: configuration.maximumPlayers,
              })
          : undefined,
      );
      if (result.successful && result.status === 'SUCCESS') {
        return {
          fallbackRequired: false,
          acknowledgement: {
            type: 'LOBBY_CREATED',
            payload: {
              commandId,
              matchId,
              successful: true,
              status: 'SUCCESS',
              externalLobbyId: result.externalLobbyId,
              observedAt: observedAt(),
            },
          },
        };
      }
      return {
        fallbackRequired: true,
        fallbackMessage: 'Automatic lobby creation is unavailable — manual fallback required',
        lobby,
        acknowledgement: {
          type: 'LOBBY_CREATION_RESULT',
          payload: {
            commandId,
            matchId,
            successful: false,
            status: failedStatus(result),
            diagnostic: result.diagnosticCode,
            manualFallbackRequired: true,
            observedAt: observedAt(),
          },
        },
      };
    }
    case 'JOIN_LOBBY': {
      const { commandId, matchId } = event.payload;
      const lobby = toLobbyCredentials(event.payload.credentials);
      const result = await safelyRunAdapter(
        adapter ? () => adapter.joinCustomLobby(lobby) : undefined,
      );
      if (result.successful && result.status === 'SUCCESS') {
        return {
          fallbackRequired: false,
          lobby,
          acknowledgement: {
            type: 'JOIN_SUCCESS',
            payload: { commandId, matchId, status: 'SUCCESS', observedAt: observedAt() },
          },
        };
      }
      return {
        fallbackRequired: true,
        fallbackMessage: 'Automatic join is unavailable — use the lobby fallback',
        lobby,
        acknowledgement: {
          type: 'JOIN_FAILED',
          payload: {
            commandId,
            matchId,
            status: failedStatus(result),
            diagnostic: result.diagnosticCode,
            manualFallbackRequired: true,
            observedAt: observedAt(),
          },
        },
      };
    }
    case 'START_GAME': {
      const { commandId, matchId } = event.payload;
      const result = await safelyRunAdapter(adapter ? () => adapter.startGame() : undefined);
      const successful = result.successful && result.status === 'SUCCESS';
      return {
        fallbackRequired: !successful,
        fallbackMessage: successful
          ? undefined
          : 'Automatic start is unavailable — waiting for verified League gameflow',
        acknowledgement: {
          type: 'GAMEFLOW_OBSERVED',
          payload: {
            commandId,
            matchId,
            successful,
            status: successful ? 'SUCCESS' : failedStatus(result),
            diagnosticCode: successful ? undefined : result.diagnosticCode,
            state: result.gameflowState,
            manualFallbackRequired: !successful,
            observedAt: observedAt(),
          },
        },
      };
    }
  }
}
