import { describe, expect, it } from 'vitest';
import { parseDuelFirstBlood } from './LiveClientDataClient.js';

describe('Pinkward duel first blood', () => {
  const activePlayer = {
    summonerName: 'Claude Code',
    riotId: 'Claude Code#Java',
    riotIdGameName: 'Claude Code',
    riotIdTagLine: 'Java',
  };

  it('uses the earliest champion kill and recognizes a local victory', () => {
    expect(parseDuelFirstBlood({
      Events: [
        { EventID: 9, EventName: 'ChampionKill', EventTime: 45, KillerName: 'Opponent', VictimName: 'Claude Code' },
        { EventID: 4, EventName: 'ChampionKill', EventTime: 30.25, KillerName: 'Claude Code#Java', VictimName: 'Opponent' },
      ],
    }, activePlayer)).toEqual({
      eventId: 4,
      eventTimeSeconds: 30.25,
      killerName: 'Claude Code#Java',
      victimName: 'Opponent',
      localPlayerWon: true,
    });
  });

  it('recognizes the active player as the first victim', () => {
    expect(parseDuelFirstBlood({
      Events: [
        { EventID: 3, EventName: 'ChampionKill', EventTime: 18, KillerName: 'Opponent', VictimName: 'claude code' },
      ],
    }, activePlayer)?.localPlayerWon).toBe(false);
  });

  it('ignores unrelated and malformed events', () => {
    expect(parseDuelFirstBlood({
      Events: [
        { EventID: 1, EventName: 'TurretKilled', EventTime: 10, KillerName: 'Claude Code' },
        { EventID: 2, EventName: 'ChampionKill', EventTime: 12, KillerName: 'Minion', VictimName: 'Opponent' },
      ],
    }, activePlayer)).toBeNull();
  });
});
