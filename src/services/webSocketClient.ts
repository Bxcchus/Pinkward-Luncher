import type { ChatMessage, MatchLifecycle, MatchParticipant } from '../domain/types';

export type LeagueOperationStatus = 'SUCCESS' | 'FAILED' | 'UNSUPPORTED' | 'UNKNOWN';

export interface WireLobbyCredentials {
  /** `name` is accepted during the backend migration to the canonical `lobbyName`. */
  lobbyName?: string;
  name?: string;
  password: string;
}

export interface CreateLobbyCommandPayload {
  commandId: string;
  matchId: string;
  configuration: {
    credentials: WireLobbyCredentials;
    region: string;
    maximumPlayers: number;
  };
}

export interface JoinLobbyCommandPayload {
  commandId: string;
  matchId: string;
  credentials: WireLobbyCredentials;
}

export interface StartGameCommandPayload {
  commandId: string;
  matchId: string;
}

export type ServerEvent =
  | { type: 'PRESENCE_UPDATED'; payload: { playersOnline: number } }
  | { type: 'QUEUE_JOINED'; payload: { playersSearching: number; estimatedWaitSeconds: number } }
  | { type: 'QUEUE_LEFT'; payload: Record<string, never> }
  | { type: 'MATCH_FOUND'; payload: { readyCheckId: string } }
  | { type: 'READY_CHECK_STARTED'; payload: { readyCheckId: string; timeoutSeconds: number } }
  | { type: 'READY_CHECK_UPDATED'; payload: { acceptedCount: number } }
  | {
      type: 'PARTY_INVITATION_RECEIVED';
      payload: {
        id: string;
        partyId: string;
        leaderId: string;
        gameName: string;
        tagLine: string;
        createdAt: string;
      };
    }
  | {
      type: 'MATCH_READY';
      payload: { matchId: string; participants: MatchParticipant[] };
    }
  | { type: 'LOBBY_OWNER_SELECTED'; payload: { matchId: string } }
  | { type: 'CREATE_LOBBY'; payload: CreateLobbyCommandPayload }
  | { type: 'MANUAL_CREATE_LOBBY'; payload: CreateLobbyCommandPayload }
  | { type: 'LOBBY_CREATING'; payload: { matchId: string } }
  | { type: 'LOBBY_READY'; payload: { matchId: string; credentials: WireLobbyCredentials } }
  | { type: 'JOIN_LOBBY'; payload: JoinLobbyCommandPayload }
  | { type: 'PLAYER_JOINED'; payload: { playerId: string } }
  | { type: 'LOBBY_FULL'; payload: { matchId?: string } }
  | { type: 'LOBBY_VALIDATING'; payload: { matchId?: string } }
  | { type: 'LOBBY_VALID'; payload: { matchId?: string } }
  | { type: 'STARTING'; payload: { matchId?: string } }
  | { type: 'START_GAME'; payload: StartGameCommandPayload }
  | { type: 'CHAMP_SELECT'; payload: { matchId?: string } }
  | { type: 'GAME_STARTED'; payload: { matchId?: string } }
  | {
      type: 'GAME_ENDED';
      payload: {
        matchId?: string;
        outcome?: 'BLUE_WIN' | 'RED_WIN' | 'UNKNOWN';
        result?: 'WIN' | 'LOSS';
        durationSeconds?: number;
        score?: string;
      };
    }
  | {
      type: 'MATCH_FINISHED';
      payload: {
        matchId: string;
        outcome?: 'BLUE_WIN' | 'RED_WIN' | 'UNKNOWN';
        result?: 'WIN' | 'LOSS';
        durationSeconds?: number;
        score?: string;
        resolutionSource?: string;
      };
    }
  | { type: 'MATCH_CANCELLED'; payload: { matchId: string; reason?: string } }
  | { type: 'CHAT_MESSAGE'; payload: ChatMessage };

export type ClientEvent =
  | {
      type: 'HEARTBEAT';
      payload: { leagueState: string; adapterHealthy: boolean; observedAt: string };
    }
  | {
      type: 'LOBBY_CREATED';
      payload: {
        commandId: string;
        matchId: string;
        successful: true;
        status: 'SUCCESS';
        externalLobbyId?: string;
        observedAt: string;
      };
    }
  | {
      type: 'LOBBY_CREATION_RESULT';
      payload: {
        commandId: string;
        matchId: string;
        successful: false;
        status: Exclude<LeagueOperationStatus, 'SUCCESS'>;
        diagnostic: string;
        manualFallbackRequired: true;
        observedAt: string;
      };
    }
  | {
      type: 'JOIN_SUCCESS';
      payload: { commandId: string; matchId: string; status: 'SUCCESS'; observedAt: string };
    }
  | {
      type: 'JOIN_FAILED';
      payload: {
        commandId: string;
        matchId: string;
        status: Exclude<LeagueOperationStatus, 'SUCCESS'>;
        diagnostic: string;
        manualFallbackRequired: true;
        observedAt: string;
      };
    }
  | {
      type: 'GAMEFLOW_OBSERVED';
      payload: {
        commandId?: string;
        matchId: string;
        successful?: boolean;
        status?: LeagueOperationStatus;
        diagnosticCode?: string;
        state: string;
        manualFallbackRequired?: boolean;
        observedAt: string;
      };
    }
  | {
      type: 'GAME_ENDED';
      payload: {
        matchId: string;
        outcome: 'BLUE_WIN' | 'RED_WIN' | 'UNKNOWN';
        durationSeconds?: number;
        score?: string;
        observedAt: string;
      };
    };

const lifecycleByEvent: Partial<Record<ServerEvent['type'], MatchLifecycle>> = {
  MATCH_READY: 'MATCH_READY',
  LOBBY_OWNER_SELECTED: 'LOBBY_OWNER_SELECTED',
  CREATE_LOBBY: 'LOBBY_CREATING',
  MANUAL_CREATE_LOBBY: 'LOBBY_CREATING',
  LOBBY_CREATING: 'LOBBY_CREATING',
  LOBBY_READY: 'LOBBY_READY',
  JOIN_LOBBY: 'PLAYERS_JOINING',
  LOBBY_FULL: 'LOBBY_FULL',
  LOBBY_VALIDATING: 'LOBBY_VALIDATING',
  LOBBY_VALID: 'LOBBY_VALID',
  STARTING: 'STARTING',
  START_GAME: 'STARTING',
  CHAMP_SELECT: 'CHAMP_SELECT',
  GAME_STARTED: 'IN_GAME',
  GAME_ENDED: 'POST_GAME',
  MATCH_FINISHED: 'FINISHED',
};

export function lifecycleForServerEvent(event: ServerEvent): MatchLifecycle | null {
  return lifecycleByEvent[event.type] ?? null;
}

export class TypedWebSocketClient {
  private socket: WebSocket | null = null;
  private reconnectAttempt = 0;
  private reconnectTimer: number | null = null;
  private closedByUser = false;

  constructor(
    private readonly url: string,
    private readonly onEvent: (event: ServerEvent) => void,
    private readonly onStatus: (connected: boolean) => void,
  ) {}

  connect(accessToken: string): void {
    this.closedByUser = false;
    if (
      this.socket?.readyState === WebSocket.OPEN ||
      this.socket?.readyState === WebSocket.CONNECTING
    ) return;
    if (this.reconnectTimer !== null) {
      window.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    const url = new URL(this.url);
    url.searchParams.set('access_token', accessToken);
    const socket = new WebSocket(url);
    this.socket = socket;
    socket.addEventListener('open', () => {
      if (this.socket !== socket) return;
      this.reconnectAttempt = 0;
      this.onStatus(true);
    });
    socket.addEventListener('message', (message) => {
      if (this.socket !== socket) return;
      try {
        const event = JSON.parse(String(message.data)) as ServerEvent;
        if (event && typeof event.type === 'string' && 'payload' in event) this.onEvent(event);
      } catch {
        // Ignore malformed/untrusted messages; the connection stays available.
      }
    });
    socket.addEventListener('close', () => {
      if (this.socket !== socket) return;
      this.socket = null;
      this.onStatus(false);
      if (!this.closedByUser) this.scheduleReconnect(accessToken);
    });
    socket.addEventListener('error', () => {
      if (this.socket === socket) socket.close();
    });
  }

  send(event: ClientEvent): boolean {
    if (this.socket?.readyState !== WebSocket.OPEN) return false;
    this.socket.send(JSON.stringify(event));
    return true;
  }

  close(): void {
    this.closedByUser = true;
    if (this.reconnectTimer !== null) {
      window.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    const socket = this.socket;
    this.socket = null;
    socket?.close();
  }

  private scheduleReconnect(accessToken: string): void {
    if (this.reconnectTimer !== null) window.clearTimeout(this.reconnectTimer);
    const delay = Math.min(1_000 * 2 ** this.reconnectAttempt, 15_000);
    this.reconnectAttempt += 1;
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null;
      this.connect(accessToken);
    }, delay);
  }
}
