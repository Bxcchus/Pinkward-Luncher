import { describe, expect, it } from 'vitest';
import { lifecycleForServerEvent, type ServerEvent } from './webSocketClient';

describe('typed WebSocket lifecycle mapping', () => {
  it.each([
    ['LOBBY_FULL', 'LOBBY_FULL'],
    ['LOBBY_VALID', 'LOBBY_VALID'],
    ['START_GAME', 'STARTING'],
    ['CHAMP_SELECT', 'CHAMP_SELECT'],
    ['GAME_STARTED', 'IN_GAME'],
    ['MATCH_FINISHED', 'FINISHED'],
  ] as const)('maps %s to %s', (type, expected) => {
    const event = { type, payload: type === 'MATCH_FINISHED' ? { matchId: 'match-1' } : {} } as ServerEvent;
    expect(lifecycleForServerEvent(event)).toBe(expected);
  });
});
