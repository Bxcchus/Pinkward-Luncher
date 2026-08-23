import type { ChatMessage, DuelSnapshot, PartyContext, PlayerIdentity, PlayerStats, Role } from '../domain/types';
import { runtimeConfig } from './runtimeConfig';

interface SecureLoginRequest {
  riotPuuid: string;
  gameName: string;
  tagLine: string;
  region: string;
}

interface AuthResponse {
  accessToken: string;
  player: PlayerIdentity;
}

interface QueueRequest {
  primaryRole: Role;
  secondaryRole: Role;
}

interface DuelFinishRequest {
  outcome: 'BLUE_WIN' | 'RED_WIN' | 'UNKNOWN';
  winCondition?: 'FIRST_BLOOD' | 'CREEP_SCORE_100' | 'FIRST_TURRET';
  durationSeconds?: number;
  score?: string;
  completedAt: string;
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export class W3cApiClient {
  private accessToken: string | null = null;

  async login(request: SecureLoginRequest): Promise<PlayerIdentity> {
    const response = await this.request<AuthResponse>('/api/v1/auth/login', {
      method: 'POST',
      body: JSON.stringify(request),
    });
    this.accessToken = response.accessToken;
    return response.player;
  }

  joinQueue(request: QueueRequest): Promise<void> {
    return this.request<void>('/api/v1/queue', { method: 'POST', body: JSON.stringify(request) });
  }

  leaveQueue(): Promise<void> {
    return this.request<void>('/api/v1/queue/me', { method: 'DELETE' });
  }

  getParty(): Promise<PartyContext> {
    return this.request<PartyContext>('/api/v1/parties/me', { method: 'GET' });
  }

  inviteToParty(gameName: string, tagLine: string): Promise<PartyContext> {
    return this.request<PartyContext>('/api/v1/parties/invitations', {
      method: 'POST',
      body: JSON.stringify({ gameName, tagLine }),
    });
  }

  acceptPartyInvitation(invitationId: string): Promise<PartyContext> {
    return this.request<PartyContext>(`/api/v1/parties/invitations/${encodeURIComponent(invitationId)}/accept`, { method: 'POST' });
  }

  declinePartyInvitation(invitationId: string): Promise<PartyContext> {
    return this.request<PartyContext>(`/api/v1/parties/invitations/${encodeURIComponent(invitationId)}/decline`, { method: 'POST' });
  }

  updatePartyRoles(primaryRole: Role, secondaryRole: Role): Promise<PartyContext> {
    return this.request<PartyContext>('/api/v1/parties/me/roles', {
      method: 'PUT',
      body: JSON.stringify({ primaryRole, secondaryRole }),
    });
  }

  removePartyMember(playerId: string): Promise<PartyContext> {
    return this.request<PartyContext>(`/api/v1/parties/members/${encodeURIComponent(playerId)}`, { method: 'DELETE' });
  }

  leaveParty(): Promise<PartyContext> {
    return this.request<PartyContext>('/api/v1/parties/me', { method: 'DELETE' });
  }

  joinDuelQueue(request: QueueRequest): Promise<DuelSnapshot> {
    return this.request<DuelSnapshot>('/api/v1/duel/queue', {
      method: 'POST',
      body: JSON.stringify(request),
    });
  }

  getMyDuel(): Promise<DuelSnapshot> {
    return this.request<DuelSnapshot>('/api/v1/duel/queue/me', { method: 'GET' });
  }

  leaveDuelQueue(): Promise<void> {
    return this.request<void>('/api/v1/duel/queue/me', { method: 'DELETE' });
  }

  duelLobbyCreated(matchId: string, partyId: string): Promise<DuelSnapshot> {
    return this.request<DuelSnapshot>(
      `/api/v1/duel/${encodeURIComponent(matchId)}/lobby-created`,
      { method: 'POST', body: JSON.stringify({ partyId }) },
    );
  }

  duelJoined(matchId: string): Promise<DuelSnapshot> {
    return this.duelAction(matchId, 'joined');
  }

  duelStarted(matchId: string): Promise<DuelSnapshot> {
    return this.duelAction(matchId, 'started');
  }

  finishDuel(matchId: string, result?: DuelFinishRequest): Promise<void> {
    return this.request<void>(`/api/v1/duel/${encodeURIComponent(matchId)}/finished`, {
      method: 'POST',
      ...(result ? { body: JSON.stringify(result) } : {}),
    });
  }

  acceptReadyCheck(readyCheckId: string): Promise<void> {
    return this.request<void>(`/api/v1/ready-checks/${encodeURIComponent(readyCheckId)}/accept`, {
      method: 'POST',
    });
  }

  declineReadyCheck(readyCheckId: string): Promise<void> {
    return this.request<void>(`/api/v1/ready-checks/${encodeURIComponent(readyCheckId)}/decline`, {
      method: 'POST',
    });
  }

  heartbeat(): Promise<void> {
    return this.request<void>('/api/v1/presence/heartbeat', { method: 'POST' });
  }

  getMyStats(): Promise<PlayerStats> {
    return this.request<PlayerStats>('/api/v1/stats/me', { method: 'GET' });
  }

  getChatMessages(): Promise<ChatMessage[]> {
    return this.request<ChatMessage[]>('/api/v1/chat/messages', { method: 'GET' });
  }

  sendChatMessage(content: string): Promise<ChatMessage> {
    return this.request<ChatMessage>('/api/v1/chat/messages', {
      method: 'POST',
      body: JSON.stringify({ content }),
    });
  }

  getToken(): string | null {
    return this.accessToken;
  }

  private duelAction(matchId: string, action: string): Promise<DuelSnapshot> {
    return this.request<DuelSnapshot>(
      `/api/v1/duel/${encodeURIComponent(matchId)}/${action}`,
      { method: 'POST' },
    );
  }

  private async request<T>(path: string, init: RequestInit): Promise<T> {
    const response = await fetch(`${runtimeConfig.apiBaseUrl}${path}`, {
      ...init,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        ...(this.accessToken ? { Authorization: `Bearer ${this.accessToken}` } : {}),
        ...init.headers,
      },
    });

    if (!response.ok) {
      throw new ApiError(`Backend request failed (${response.status}).`, response.status);
    }
    if (response.status === 204 || response.headers.get('content-length') === '0') {
      return undefined as T;
    }
    return (await response.json()) as T;
  }
}
