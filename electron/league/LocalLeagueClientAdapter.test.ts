import { describe, expect, it } from 'vitest';
import {
  customLobbyPreset,
  duelTeamBalanceAction,
  isManagedTestLobbyName,
} from './LocalLeagueClientAdapter.js';

describe('managed custom lobby names', () => {
  it('accepts current Pinkward duel and bot lobbies', () => {
    expect(isManagedTestLobbyName('PINKWARD-DUEL-ABC234', 'DUEL')).toBe(true);
    expect(isManagedTestLobbyName('PINKWARD-BOTS-ABC234', 'BOTS')).toBe(true);
  });

  it('keeps existing W3C test lobbies compatible but rejects unrelated rooms', () => {
    expect(isManagedTestLobbyName('W3C-DUEL-LEGACY1', 'DUEL')).toBe(true);
    expect(isManagedTestLobbyName('W3C-BOTS-LEGACY1', 'BOTS')).toBe(true);
    expect(isManagedTestLobbyName('FRIENDS-ROOM', 'DUEL')).toBe(false);
    expect(isManagedTestLobbyName('PINKWARD-BOTS-ABC234', 'DUEL')).toBe(false);
  });

  it('switches only when both duel players are on the same League team', () => {
    expect(duelTeamBalanceAction(1, 1)).toBe('BALANCED');
    expect(duelTeamBalanceAction(2, 0)).toBe('TEAM2');
    expect(duelTeamBalanceAction(0, 2)).toBe('TEAM1');
    expect(duelTeamBalanceAction(1, 0)).toBe('INVALID');
    expect(duelTeamBalanceAction(2, 1)).toBe('INVALID');
  });

  it('uses ARAM for duels and tournament draft on Summoner’s Rift for 5v5', () => {
    expect(customLobbyPreset('DUEL_ARAM')).toMatchObject({
      queueId: 3200,
      mapId: 12,
      gameMode: 'ARAM',
      expectedPlayers: 2,
      teamSize: 1,
    });
    expect(customLobbyPreset('TOURNAMENT_DRAFT_5V5')).toMatchObject({
      queueId: 3130,
      mapId: 11,
      gameMode: 'CLASSIC',
      expectedPlayers: 10,
      teamSize: 5,
    });
  });
});
