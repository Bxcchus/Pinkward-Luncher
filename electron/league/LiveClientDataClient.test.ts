import { describe, expect, it } from 'vitest';
import { parseDuelVictory } from './LiveClientDataClient.js';

describe('Pinkward duel victory conditions', () => {
  const activePlayer = {
    summonerName: 'Claude Code',
    riotId: 'Claude Code#Java',
    riotIdGameName: 'Claude Code',
    riotIdTagLine: 'Java',
  };

  it('uses the earliest champion kill and recognizes a local victory', () => {
    expect(parseDuelVictory({
      Events: [
        { EventID: 9, EventName: 'ChampionKill', EventTime: 45, KillerName: 'Opponent', VictimName: 'Claude Code' },
        { EventID: 4, EventName: 'ChampionKill', EventTime: 30.25, KillerName: 'Claude Code#Java', VictimName: 'Opponent' },
      ],
    }, activePlayer)).toEqual({
      eventId: 4,
      condition: 'FIRST_BLOOD',
      eventTimeSeconds: 30.25,
      winnerName: 'Claude Code#Java',
      loserName: 'Opponent',
      winnerValue: 1,
      loserValue: 0,
      localPlayerWon: true,
    });
  });

  it('recognizes the active player as the first victim', () => {
    expect(parseDuelVictory({
      Events: [
        { EventID: 3, EventName: 'ChampionKill', EventTime: 18, KillerName: 'Opponent', VictimName: 'claude code' },
      ],
    }, activePlayer)?.localPlayerWon).toBe(false);
  });

  it('detects the first player to reach 100 creep score', () => {
    expect(parseDuelVictory({ Events: [] }, activePlayer, [
      { summonerName: 'Claude Code', team: 'ORDER', scores: { creepScore: 100 } },
      { summonerName: 'Opponent', team: 'CHAOS', scores: { creepScore: 94 } },
    ], 612.4)).toEqual({
      condition: 'CREEP_SCORE_100',
      eventTimeSeconds: 612.4,
      winnerName: 'Claude Code',
      loserName: 'Opponent',
      winnerValue: 100,
      loserValue: 94,
      localPlayerWon: true,
    });
  });

  it('detects the first turret and maps its destroyed side to the winner', () => {
    expect(parseDuelVictory({
      Events: [
        { EventID: 12, EventName: 'TurretKilled', EventTime: 430, KillerName: 'Opponent', TurretKilled: 'Turret_T1_C_05_A' },
      ],
    }, activePlayer, [
      { summonerName: 'Claude Code', team: 'ORDER', scores: { creepScore: 72 } },
      { summonerName: 'Opponent', team: 'CHAOS', scores: { creepScore: 68 } },
    ], 431)).toEqual({
      condition: 'FIRST_TURRET',
      eventId: 12,
      eventTimeSeconds: 430,
      winnerName: 'Opponent',
      loserName: 'Claude Code',
      winnerValue: 1,
      loserValue: 0,
      localPlayerWon: false,
    });
  });

  it('uses the earliest completed event condition', () => {
    expect(parseDuelVictory({
      Events: [
        { EventID: 20, EventName: 'TurretKilled', EventTime: 300, TurretKilled: 'Turret_T2_C_05_A' },
        { EventID: 18, EventName: 'ChampionKill', EventTime: 250, KillerName: 'Opponent', VictimName: 'Claude Code' },
      ],
    }, activePlayer, [
      { summonerName: 'Claude Code', team: 'ORDER', scores: { creepScore: 80 } },
      { summonerName: 'Opponent', team: 'CHAOS', scores: { creepScore: 75 } },
    ])?.condition).toBe('FIRST_BLOOD');
  });

  it('ignores unrelated and malformed events before an objective is reached', () => {
    expect(parseDuelVictory({
      Events: [
        { EventID: 1, EventName: 'TurretKilled', EventTime: 10, KillerName: 'Claude Code', TurretKilled: 'unknown' },
        { EventID: 2, EventName: 'ChampionKill', EventTime: 12, KillerName: 'Minion', VictimName: 'Opponent' },
      ],
    }, activePlayer, [
      { summonerName: 'Claude Code', team: 'ORDER', scores: { creepScore: 99 } },
      { summonerName: 'Opponent', team: 'CHAOS', scores: { creepScore: 99 } },
    ])).toBeNull();
  });
});
