import { afterEach, describe, expect, it, vi } from 'vitest';
import { lifecycleForServerEvent, TypedWebSocketClient, type ServerEvent } from './webSocketClient';

class FakeWebSocket extends EventTarget {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;
  static instances: FakeWebSocket[] = [];

  readyState = FakeWebSocket.CONNECTING;
  closeCount = 0;

  constructor(readonly url: URL) {
    super();
    FakeWebSocket.instances.push(this);
  }

  open(): void {
    this.readyState = FakeWebSocket.OPEN;
    this.dispatchEvent(new Event('open'));
  }

  close(): void {
    this.closeCount += 1;
    this.readyState = FakeWebSocket.CLOSED;
    this.dispatchEvent(new Event('close'));
  }

  send(): void {}
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  FakeWebSocket.instances = [];
});

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

describe('typed WebSocket reconnection', () => {
  it('ignores stale socket errors after a replacement connection opens', () => {
    vi.useFakeTimers();
    vi.stubGlobal('WebSocket', FakeWebSocket);
    const statuses: boolean[] = [];
    const client = new TypedWebSocketClient(
      'wss://play.pinkward.lol/ws',
      () => undefined,
      (connected) => statuses.push(connected),
    );

    client.connect('token');
    const first = FakeWebSocket.instances[0];
    first.open();
    first.close();

    vi.advanceTimersByTime(1_000);
    const replacement = FakeWebSocket.instances[1];
    replacement.open();
    first.dispatchEvent(new Event('error'));

    expect(replacement.closeCount).toBe(0);
    expect(statuses).toEqual([true, false, true]);
    client.close();
  });
});
