import { ROLES, type MatchSummary } from '../domain/types';

const MAX_HISTORY_ENTRIES = 50;
const STORAGE_PREFIX = 'w3c.matchHistory.';

function validMatchSummary(value: unknown): value is MatchSummary {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<MatchSummary>;
  return (
    typeof candidate.id === 'string' &&
    candidate.id.length > 0 &&
    typeof candidate.playedAt === 'string' &&
    !Number.isNaN(Date.parse(candidate.playedAt)) &&
    (candidate.result === 'WIN' || candidate.result === 'LOSS' || candidate.result === 'UNKNOWN') &&
    ROLES.some((role) => role === candidate.role) &&
    Number.isSafeInteger(candidate.durationSeconds) &&
    (candidate.durationSeconds ?? -1) >= 0 &&
    typeof candidate.score === 'string'
  );
}

function storageKey(playerId: string): string {
  return `${STORAGE_PREFIX}${playerId}`;
}

export function loadMatchHistory(
  playerId: string,
  storage: Pick<Storage, 'getItem'> = localStorage,
): MatchSummary[] {
  try {
    const raw = storage.getItem(storageKey(playerId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(validMatchSummary).slice(0, MAX_HISTORY_ENTRIES);
  } catch {
    return [];
  }
}

export function saveMatchHistory(
  playerId: string,
  history: MatchSummary[],
  storage: Pick<Storage, 'setItem'> = localStorage,
): void {
  try {
    storage.setItem(
      storageKey(playerId),
      JSON.stringify(history.filter(validMatchSummary).slice(0, MAX_HISTORY_ENTRIES)),
    );
  } catch {
    // History display remains available in memory if local storage is unavailable.
  }
}
