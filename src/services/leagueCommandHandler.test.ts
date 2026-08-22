import { describe, expect, it, vi } from 'vitest';
import {
  handleLeagueCommand,
  type LeagueAdapterResult,
  type LeagueCommandAdapter,
} from './leagueCommandHandler';

const fixedTime = () => '2026-08-20T10:00:00.000Z';
const unknown: LeagueAdapterResult = {
  status: 'UNKNOWN',
  successful: false,
  automated: false,
  diagnosticCode: 'LCU_ADAPTER_NOT_VERIFIED',
  gameflowState: 'UNKNOWN',
};

const adapter = (result: LeagueAdapterResult): LeagueCommandAdapter => ({
  createCustomLobby: vi.fn().mockResolvedValue(result),
  joinCustomLobby: vi.fn().mockResolvedValue(result),
  startGame: vi.fn().mockResolvedValue(result),
});

describe('League command acknowledgements', () => {
  it('reports UNKNOWN lobby creation as a fallback result, never LOBBY_CREATED', async () => {
    const result = await handleLeagueCommand(
      {
        type: 'CREATE_LOBBY',
        payload: {
          commandId: 'command-create',
          matchId: 'match-1',
          configuration: {
            credentials: { lobbyName: 'W3C-ABC123', password: 'SECRET12' },
            region: 'EUW',
            maximumPlayers: 10,
          },
        },
      },
      adapter(unknown),
      fixedTime,
    );

    expect(result.acknowledgement.type).toBe('LOBBY_CREATION_RESULT');
    expect(result.acknowledgement.payload).toMatchObject({
      status: 'UNKNOWN',
      manualFallbackRequired: true,
    });
    expect(result.fallbackRequired).toBe(true);
  });

  it('reports UNKNOWN automatic join as JOIN_FAILED with manual fallback', async () => {
    const result = await handleLeagueCommand(
      {
        type: 'JOIN_LOBBY',
        payload: {
          commandId: 'command-join',
          matchId: 'match-1',
          credentials: { name: 'W3C-ABC123', password: 'SECRET12' },
        },
      },
      adapter(unknown),
      fixedTime,
    );

    expect(result.acknowledgement.type).toBe('JOIN_FAILED');
    expect(result.acknowledgement.payload).toMatchObject({
      status: 'UNKNOWN',
      manualFallbackRequired: true,
    });
    expect(result.lobby?.name).toBe('W3C-ABC123');
  });

  it('reports START_GAME through GAMEFLOW_OBSERVED with UNKNOWN gameflow', async () => {
    const result = await handleLeagueCommand(
      {
        type: 'START_GAME',
        payload: { commandId: 'command-start', matchId: 'match-1' },
      },
      adapter(unknown),
      fixedTime,
    );

    expect(result.acknowledgement.type).toBe('GAMEFLOW_OBSERVED');
    expect(result.acknowledgement.payload).toMatchObject({
      status: 'UNKNOWN',
      state: 'UNKNOWN',
      successful: false,
      manualFallbackRequired: true,
    });
  });

  it('emits success only when the adapter explicitly verifies SUCCESS', async () => {
    const success: LeagueAdapterResult = {
      ...unknown,
      status: 'SUCCESS',
      successful: true,
      diagnosticCode: 'OK',
      externalLobbyId: 'external-1',
    };
    const league = adapter(success);
    const result = await handleLeagueCommand(
      {
        type: 'CREATE_LOBBY',
        payload: {
          commandId: 'command-create',
          matchId: 'match-1',
          configuration: {
            credentials: { lobbyName: 'W3C-ABC123', password: 'SECRET12' },
            region: 'EUW',
            maximumPlayers: 10,
          },
        },
      },
      league,
      fixedTime,
    );

    expect(result.acknowledgement.type).toBe('LOBBY_CREATED');
    expect(result.fallbackRequired).toBe(false);
    expect(league.createCustomLobby).toHaveBeenCalledWith(expect.objectContaining({
      expectedPlayers: 10,
      ruleset: 'TOURNAMENT_DRAFT_5V5',
    }));
  });
});
