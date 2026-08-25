import { describe, expect, it, vi } from 'vitest';
import type { RawData } from 'ws';
import {
  LcuEventClient,
  parseLcuGameflowMessage,
  type EventSocket,
  type LeagueGameflowEvent,
} from './LcuEventClient.js';

class FakeSocket implements EventSocket {
  readonly sent: string[] = [];
  private readonly listeners = new Map<
    string,
    Array<(() => void) | ((data: RawData) => void)>
  >();

  on(event: 'open', listener: () => void): this;
  on(event: 'close', listener: () => void): this;
  on(event: 'error', listener: () => void): this;
  on(event: 'message', listener: (data: RawData) => void): this;
  on(event: string, listener: (() => void) | ((data: RawData) => void)): this {
    const callbacks = this.listeners.get(event) ?? [];
    callbacks.push(listener);
    this.listeners.set(event, callbacks);
    return this;
  }

  send(data: string): void {
    this.sent.push(data);
  }

  close(): void {}
  terminate(): void {}

  emit(event: 'open' | 'close' | 'error'): void;
  emit(event: 'message', data: RawData): void;
  emit(event: string, data?: RawData): void {
    this.listeners.get(event)?.forEach((listener) => {
      if (data === undefined) (listener as () => void)();
      else (listener as (value: RawData) => void)(data);
    });
  }
}

describe('LCU gameflow events', () => {
  it('accepts only gameflow WAMP events', () => {
    expect(parseLcuGameflowMessage(Buffer.from(JSON.stringify([
      8,
      'OnJsonApiEvent',
      { uri: '/lol-gameflow/v1/gameflow-phase', eventType: 'Update', data: 'InProgress' },
    ])))).toEqual({ type: 'GAMEFLOW_CHANGED', phase: 'InProgress' });
    expect(parseLcuGameflowMessage(Buffer.from(JSON.stringify([
      8,
      'OnJsonApiEvent',
      { uri: '/lol-chat/v1/conversations', data: {} },
    ])))).toBeNull();
    expect(parseLcuGameflowMessage(Buffer.from('not json'))).toBeNull();
  });

  it('resubscribes after the LCU socket reconnects', async () => {
    vi.useFakeTimers();
    const sockets: FakeSocket[] = [];
    const events: LeagueGameflowEvent[] = [];
    const client = new LcuEventClient(
      (event) => events.push(event),
      async () => ({ url: 'wss://127.0.0.1:1234/', authorization: 'Basic hidden' }),
      () => {
        const socket = new FakeSocket();
        sockets.push(socket);
        return socket;
      },
    );

    client.start();
    await Promise.resolve();
    sockets[0].emit('open');
    expect(sockets[0].sent).toEqual([JSON.stringify([5, 'OnJsonApiEvent'])]);

    sockets[0].emit('close');
    await vi.advanceTimersByTimeAsync(1_000);
    expect(sockets).toHaveLength(2);
    sockets[1].emit('open');
    sockets[1].emit('message', Buffer.from(JSON.stringify([
      8,
      'OnJsonApiEvent',
      { uri: '/lol-gameflow/v1/session', data: { phase: 'ChampSelect' } },
    ])));

    expect(events.map((event) => [event.type, event.phase])).toEqual([
      ['CONNECTED', undefined],
      ['CONNECTED', undefined],
      ['GAMEFLOW_CHANGED', 'ChampSelect'],
    ]);
    client.stop();
    vi.useRealTimers();
  });
});
