import { describe, expect, it } from 'vitest';
import { isManagedTestLobbyName } from './LocalLeagueClientAdapter.js';

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
});
