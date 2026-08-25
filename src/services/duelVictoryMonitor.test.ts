import { describe, expect, it, vi } from 'vitest';
import type { LeagueDuelVictory } from '../domain/types';
import { DuelVictoryMonitor } from './duelVictoryMonitor';

const victory: LeagueDuelVictory = {
  condition: 'FIRST_BLOOD',
  eventId: 4,
  eventTimeSeconds: 23,
  winnerName: 'Winner',
  loserName: 'Loser',
  winnerValue: 1,
  loserValue: 0,
  localPlayerWon: true,
};

describe('duel victory monitor', () => {
  it('never overlaps Live Client Data requests', async () => {
    let release: ((value: LeagueDuelVictory | null) => void) | undefined;
    const read = vi.fn(() => new Promise<LeagueDuelVictory | null>((resolve) => {
      release = resolve;
    }));
    const record = vi.fn(async () => undefined);
    const monitor = new DuelVictoryMonitor(read, record);

    const first = monitor.poll();
    await monitor.poll();
    expect(read).toHaveBeenCalledTimes(1);
    release?.(null);
    await first;
    expect(record).not.toHaveBeenCalled();
  });

  it('records a confirmed result once and then stops', async () => {
    const read = vi.fn(async () => victory);
    let confirmSaved: (() => void) | undefined;
    const record = vi.fn(() => new Promise<void>((resolve) => {
      confirmSaved = resolve;
    }));
    const monitor = new DuelVictoryMonitor(read, record);

    const firstPoll = monitor.poll();
    await Promise.resolve();
    expect(monitor.isComplete).toBe(false);
    confirmSaved?.();
    await firstPoll;
    await monitor.poll();
    expect(read).toHaveBeenCalledTimes(1);
    expect(record).toHaveBeenCalledTimes(1);
    expect(monitor.isComplete).toBe(true);
  });

  it('retries when the server has not saved the result', async () => {
    const read = vi.fn(async () => victory);
    const record = vi.fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(undefined);
    const monitor = new DuelVictoryMonitor(read, record);

    await expect(monitor.poll()).rejects.toThrow('offline');
    expect(monitor.isComplete).toBe(false);
    await monitor.poll();
    expect(record).toHaveBeenCalledTimes(2);
    expect(monitor.isComplete).toBe(true);
  });
});
