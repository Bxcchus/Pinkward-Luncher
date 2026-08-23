import { describe, expect, it } from 'vitest';
import {
  DUEL_LOSER_EXIT_DELAY_MS,
  DUEL_WINNER_EXIT_DELAY_MS,
  duelExitDelayMs,
} from './duelExitTiming';

describe('1v1 Showdown exit timing', () => {
  it('disconnects the loser after five seconds', () => {
    expect(duelExitDelayMs(false)).toBe(DUEL_LOSER_EXIT_DELAY_MS);
    expect(DUEL_LOSER_EXIT_DELAY_MS).toBe(5_000);
  });

  it('disconnects the winner one second after the loser', () => {
    expect(duelExitDelayMs(true)).toBe(DUEL_WINNER_EXIT_DELAY_MS);
    expect(DUEL_WINNER_EXIT_DELAY_MS).toBe(6_000);
  });
});
