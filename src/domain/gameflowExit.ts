import type { MatchLifecycle } from './types';

/** Two polls absorb LCU transitions; six allow post-game history to become available. */
export function shouldCloseInactiveGameflow(
  lifecycle: MatchLifecycle | null,
  inactivePolls: number,
  hasGameId: boolean,
): boolean {
  if (lifecycle === 'CHAMP_SELECT') return inactivePolls >= 2;
  if (lifecycle !== 'IN_GAME') return false;
  return inactivePolls >= (hasGameId ? 6 : 2);
}
