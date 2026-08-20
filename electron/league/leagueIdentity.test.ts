import { describe, expect, it } from 'vitest';
import { parseLeagueIdentity } from './leagueIdentity.js';

describe('League session identity parsing', () => {
  it('returns only Riot ID and supported region from an authenticated session', () => {
    expect(parseLeagueIdentity(
      { connected: true, state: 'SUCCEEDED', idToken: 'must-not-leak' },
      { gameName: 'Claude Code', tagLine: 'Java', puuid: 'private-id' },
      { region: 'EUW', locale: 'fr_FR' },
    )).toEqual({ riotPuuid: 'private-id', gameName: 'Claude Code', tagLine: 'Java', region: 'EUW' });
  });

  it('rejects a session that is not fully authenticated', () => {
    expect(parseLeagueIdentity(
      { connected: false, state: 'IN_PROGRESS' },
      { gameName: 'Player', tagLine: 'EUW' },
      { region: 'EUW' },
    )).toBeNull();
  });

  it('normalizes supported platform aliases and rejects unknown regions', () => {
    expect(parseLeagueIdentity(
      { connected: true, state: 'SUCCEEDED' },
      { gameName: 'Player', tagLine: 'NA1', puuid: 'na-private-id' },
      { region: 'NA1' },
    )).toEqual({ riotPuuid: 'na-private-id', gameName: 'Player', tagLine: 'NA1', region: 'NA' });
    expect(parseLeagueIdentity(
      { connected: true, state: 'SUCCEEDED' },
      { gameName: 'Player', tagLine: 'KR1', puuid: 'kr-private-id' },
      { region: 'KR' },
    )).toBeNull();
  });
});
