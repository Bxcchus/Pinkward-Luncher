import { afterEach, describe, expect, it, vi } from 'vitest';
import { LeagueStatusMonitor } from './leagueStatusMonitor';

describe('League status fallback monitor', () => {
  afterEach(() => vi.useRealTimers());

  it('polls every five seconds when an LCU event is missed', async () => {
    vi.useFakeTimers();
    const operation = vi.fn(async () => undefined);
    const monitor = new LeagueStatusMonitor(operation, 5_000);
    monitor.start();
    await Promise.resolve();
    expect(operation).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(5_000);
    expect(operation).toHaveBeenCalledTimes(2);
    monitor.stop();
  });

  it('coalesces events received while a status request is still running', async () => {
    let releaseFirst: (() => void) | undefined;
    const operation = vi.fn(() => new Promise<void>((resolve) => {
      releaseFirst ??= resolve;
    }));
    const monitor = new LeagueStatusMonitor(operation);
    monitor.start();
    monitor.notifyEvent();
    monitor.notifyEvent();
    expect(operation).toHaveBeenCalledTimes(1);

    releaseFirst?.();
    await Promise.resolve();
    await Promise.resolve();
    expect(operation).toHaveBeenCalledTimes(2);
    monitor.stop();
  });
});
