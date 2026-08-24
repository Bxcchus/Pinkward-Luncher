import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAppController } from './useAppController';

describe('demo orchestration', () => {
  const createCustomLobby = vi.fn();
  const joinCustomLobby = vi.fn();
  const startGame = vi.fn();

  beforeEach(() => {
    vi.useFakeTimers();
    createCustomLobby.mockReset();
    joinCustomLobby.mockReset();
    startGame.mockReset();
    Object.defineProperty(window, 'w3c', {
      configurable: true,
      value: {
        platform: 'win32',
        league: {
          getStatus: vi.fn().mockResolvedValue({
            installed: true,
            running: true,
            state: 'CONNECTED',
            adapterHealthy: true,
            automationAvailable: true,
            observedAt: '2026-08-20T00:00:00.000Z',
            detail: 'Test adapter',
          }),
          createCustomLobby,
          joinCustomLobby,
          startGame,
          openLeague: vi.fn().mockResolvedValue({ opened: true }),
        },
      },
    });
  });
  afterEach(() => {
    Reflect.deleteProperty(window, 'w3c');
    vi.useRealTimers();
  });

  it('runs the 1v1 simulation with exactly two joined players', async () => {
    const { result } = renderHook(() => useAppController());

    act(() => result.current.updateSetting('demoMode', true));
    await act(async () => result.current.login('Tester', 'EUW', 'EUW'));
    await act(async () => result.current.findMatch());
    act(() => vi.advanceTimersByTime(5_000));
    expect(result.current.state.screen).toBe('READY_CHECK');

    await act(async () => result.current.acceptReadyCheck());
    act(() => vi.advanceTimersByTime(1_000));
    expect(result.current.state.screen).toBe('CREATING_MATCH');

    act(() => vi.advanceTimersByTime(2_450));
    expect(result.current.state.screen).toBe('JOINING_LOBBY');

    act(() => vi.advanceTimersByTime(2_000));
    expect(result.current.state.joinedCount).toBe(2);
    expect(result.current.state.participants).toHaveLength(2);
    expect(result.current.state.duelMatch).toBe(true);
    expect(result.current.state.participants.every((participant) => participant.joined)).toBe(true);
    expect(createCustomLobby).not.toHaveBeenCalled();
    expect(joinCustomLobby).not.toHaveBeenCalled();
    expect(startGame).not.toHaveBeenCalled();
  });
});
