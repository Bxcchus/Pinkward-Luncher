import { describe, expect, it } from 'vitest';
import { parseLeagueGameResult } from './gameResult.js';

const participants = (blueKills: number[], redKills: number[]) => [
  ...blueKills.map((kills) => ({ teamId: 100, stats: { kills } })),
  ...redKills.map((kills) => ({ teamId: 200, stats: { kills } })),
];

describe('League match-history result parsing', () => {
  it('maps the LCU team winner and team kill score', () => {
    expect(
      parseLeagueGameResult(
        {
          gameId: 42,
          gameDuration: 1_764,
          mapId: 11,
          queueId: 3130,
          participants: participants([3, 5, 8, 7, 9], [2, 4, 5, 6, 8]),
          teams: [
            { teamId: 100, win: 'Win' },
            { teamId: 200, win: 'Fail' },
          ],
        },
        42,
      ),
    ).toEqual({
      gameId: 42,
      outcome: 'BLUE_WIN',
      diagnosticCode: 'LCU_RESULT_OBSERVED',
      durationSeconds: 1_764,
      score: '32 – 25',
    });
  });

  it('does not invent a winner when both LCU teams are marked Fail', () => {
    expect(
      parseLeagueGameResult(
        {
          gameId: 43,
          gameDuration: 47,
          mapId: 11,
          queueId: 3130,
          participants: participants([0, 0, 0, 0, 0], [0, 0, 0, 0, 0]),
          teams: [
            { teamId: 100, win: 'Fail' },
            { teamId: 200, win: 'Fail' },
          ],
        },
        43,
      ),
    ).toEqual({
      gameId: 43,
      outcome: 'UNKNOWN',
      diagnosticCode: 'LCU_RESULT_NO_SINGLE_WINNER',
      durationSeconds: 47,
    });
  });

  it('accepts the two-participant payload returned for a completed 1v1', () => {
    expect(
      parseLeagueGameResult(
        {
          gameId: 7_956_713_220,
          gameDuration: 725,
          mapId: 12,
          queueId: 3200,
          participants: participants([0], [0]),
          teams: [
            { teamId: 100, win: 'Fail' },
            { teamId: 200, win: 'Win' },
          ],
        },
        7_956_713_220,
      ),
    ).toEqual({
      gameId: 7_956_713_220,
      outcome: 'RED_WIN',
      diagnosticCode: 'LCU_RESULT_OBSERVED',
      durationSeconds: 725,
      score: '0 – 0',
    });
  });

  it('rejects an unrelated or non-custom match', () => {
    expect(
      parseLeagueGameResult(
        {
          gameId: 99,
          mapId: 11,
          queueId: 420,
          participants: participants([0, 0, 0, 0, 0], [0, 0, 0, 0, 0]),
          teams: [],
        },
        42,
      ),
    ).toBeNull();
  });

  it('rejects an incomplete custom result with only one participant', () => {
    expect(
      parseLeagueGameResult(
        {
          gameId: 42,
          mapId: 11,
          queueId: 3130,
          participants: participants([0], []),
          teams: [
            { teamId: 100, win: 'Win' },
            { teamId: 200, win: 'Fail' },
          ],
        },
        42,
      ),
    ).toBeNull();
  });
});
