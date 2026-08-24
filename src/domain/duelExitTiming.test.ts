import { describe, expect, it } from 'vitest';
import {
  DUEL_LOSER_EXIT_DELAY_MS,
  DUEL_WINNER_EXIT_DELAY_MS,
  duelExitDelayMs,
  shouldSendScheduledDuelExit,
} from './duelExitTiming';

describe('1v1 Showdown exit timing', () => {
  it('disconnects the loser after five seconds', () => {
    expect(duelExitDelayMs(false)).toBe(DUEL_LOSER_EXIT_DELAY_MS);
    expect(DUEL_LOSER_EXIT_DELAY_MS).toBe(5_000);
  });

  it('disconnects the winner at the same five-second boundary', () => {
    expect(duelExitDelayMs(true)).toBe(DUEL_WINNER_EXIT_DELAY_MS);
    expect(DUEL_WINNER_EXIT_DELAY_MS).toBe(5_000);
  });

  it('never sends a delayed Alt+F4 after League has left the game', () => {
    expect(shouldSendScheduledDuelExit('IN_GAME')).toBe(true);
    expect(shouldSendScheduledDuelExit('CONNECTED')).toBe(false);
    expect(shouldSendScheduledDuelExit('LOBBY')).toBe(false);
    expect(shouldSendScheduledDuelExit('NOT_RUNNING')).toBe(false);
    expect(shouldSendScheduledDuelExit('UNKNOWN')).toBe(false);
  });
});
