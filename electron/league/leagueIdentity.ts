import type { LeagueIdentitySnapshot } from './types.js';

type JsonObject = Record<string, unknown>;

function object(value: unknown): JsonObject | null {
  return typeof value === 'object' && value !== null ? value as JsonObject : null;
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function supportedRegion(value: unknown): string | null {
  const region = text(value)?.toUpperCase();
  if (region === 'EUW') return 'EUW';
  if (region === 'EUNE' || region === 'EUN') return 'EUNE';
  if (region === 'NA' || region === 'NA1') return 'NA';
  return null;
}

function positiveInteger(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
    ? value
    : undefined;
}

export function parseLeagueIdentity(
  sessionValue: unknown,
  summonerValue: unknown,
  regionLocaleValue: unknown,
): LeagueIdentitySnapshot | null {
  const session = object(sessionValue);
  const summoner = object(summonerValue);
  const regionLocale = object(regionLocaleValue);
  if (
    !session ||
    session.connected !== true ||
    session.state !== 'SUCCEEDED' ||
    !summoner ||
    !regionLocale
  ) {
    return null;
  }

  const gameName = text(summoner.gameName);
  const tagLine = text(summoner.tagLine);
  const riotPuuid = text(summoner.puuid);
  const region = supportedRegion(regionLocale.region);
  if (!riotPuuid || !gameName || !tagLine || !region) return null;
  const profileIconId = positiveInteger(summoner.profileIconId);
  return {
    riotPuuid,
    gameName,
    tagLine,
    region,
    ...(profileIconId === undefined ? {} : { profileIconId }),
  };
}
