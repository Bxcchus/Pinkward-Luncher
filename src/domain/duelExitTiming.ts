import type { LeagueClientState } from './types';

export const DUEL_LOSER_EXIT_DELAY_MS = 5_000;
export const DUEL_WINNER_EXIT_DELAY_MS = 5_000;

export function duelExitDelayMs(localPlayerWon: boolean): number {
  return localPlayerWon ? DUEL_WINNER_EXIT_DELAY_MS : DUEL_LOSER_EXIT_DELAY_MS;
}

export function shouldSendScheduledDuelExit(state: LeagueClientState): boolean {
  return state === 'IN_GAME';
}
