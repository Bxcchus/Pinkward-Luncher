import { beforeEach, describe, expect, it } from 'vitest';
import type { MatchSummary } from '../domain/types';
import { loadMatchHistory, saveMatchHistory } from './matchHistoryStorage';

const result: MatchSummary = {
  id: 'match-1',
  playedAt: '2026-08-20T19:00:00.000Z',
  result: 'WIN',
  role: 'JUNGLE',
  durationSeconds: 725,
  score: '0 – 0',
};

describe('match history storage', () => {
  beforeEach(() => localStorage.clear());

  it('persists results separately for each player', () => {
    saveMatchHistory('player-a', [result]);

    expect(loadMatchHistory('player-a')).toEqual([result]);
    expect(loadMatchHistory('player-b')).toEqual([]);
  });

  it('ignores malformed local data', () => {
    localStorage.setItem('w3c.matchHistory.player-a', JSON.stringify([
      result,
      { ...result, id: '', result: 'DRAW' },
    ]));

    expect(loadMatchHistory('player-a')).toEqual([result]);
  });
});
