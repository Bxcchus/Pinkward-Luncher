import https from 'node:https';
import type { DuelFirstBloodSnapshot } from './types.js';

const LIVE_CLIENT_PORT = 2999;
const MAX_RESPONSE_BYTES = 1024 * 1024;

interface LiveClientEvent {
  EventID?: unknown;
  EventName?: unknown;
  EventTime?: unknown;
  KillerName?: unknown;
  VictimName?: unknown;
}

interface LiveClientEvents {
  Events?: unknown;
}

interface LiveActivePlayer {
  summonerName?: unknown;
  riotId?: unknown;
  riotIdGameName?: unknown;
  riotIdTagLine?: unknown;
}

function normalizedName(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.normalize('NFKC').trim().toLocaleLowerCase('en-US');
  return normalized || null;
}

function activePlayerAliases(player: LiveActivePlayer): Set<string> {
  const aliases = new Set<string>();
  const candidates = [player.summonerName, player.riotId, player.riotIdGameName];
  if (typeof player.riotIdGameName === 'string' && typeof player.riotIdTagLine === 'string') {
    candidates.push(`${player.riotIdGameName}#${player.riotIdTagLine}`);
  }
  candidates.forEach((candidate) => {
    const normalized = normalizedName(candidate);
    if (normalized) aliases.add(normalized);
  });
  return aliases;
}

export function parseDuelFirstBlood(
  payload: LiveClientEvents,
  activePlayer: LiveActivePlayer,
): DuelFirstBloodSnapshot | null {
  if (!Array.isArray(payload.Events)) return null;
  const aliases = activePlayerAliases(activePlayer);
  if (aliases.size === 0) return null;

  const championKills = (payload.Events as LiveClientEvent[])
    .filter((event) => event.EventName === 'ChampionKill')
    .filter(
      (event) =>
        typeof event.EventID === 'number' &&
        Number.isSafeInteger(event.EventID) &&
        typeof event.EventTime === 'number' &&
        Number.isFinite(event.EventTime) &&
        event.EventTime >= 0 &&
        typeof event.KillerName === 'string' &&
        typeof event.VictimName === 'string',
    )
    .sort((left, right) =>
      (left.EventTime as number) - (right.EventTime as number) ||
      (left.EventID as number) - (right.EventID as number),
    );
  const firstBlood = championKills[0];
  if (!firstBlood) return null;

  const killer = normalizedName(firstBlood.KillerName);
  const victim = normalizedName(firstBlood.VictimName);
  const localPlayerWon = killer ? aliases.has(killer) : false;
  const localPlayerLost = victim ? aliases.has(victim) : false;
  if (localPlayerWon === localPlayerLost) return null;

  return {
    eventId: firstBlood.EventID as number,
    eventTimeSeconds: firstBlood.EventTime as number,
    killerName: firstBlood.KillerName as string,
    victimName: firstBlood.VictimName as string,
    localPlayerWon,
  };
}

async function getJson<T>(requestPath: string): Promise<T> {
  if (!requestPath.startsWith('/') || requestPath.includes('://')) {
    throw new Error('LIVE_CLIENT_PATH_REJECTED');
  }
  return new Promise<T>((resolve, reject) => {
    const request = https.request(
      {
        hostname: '127.0.0.1',
        port: LIVE_CLIENT_PORT,
        path: requestPath,
        method: 'GET',
        rejectUnauthorized: false,
      },
      (response) => {
        const chunks: Buffer[] = [];
        let length = 0;
        response.on('data', (chunk: Buffer) => {
          length += chunk.length;
          if (length > MAX_RESPONSE_BYTES) {
            request.destroy(new Error('LIVE_CLIENT_RESPONSE_TOO_LARGE'));
            return;
          }
          chunks.push(chunk);
        });
        response.on('end', () => {
          const status = response.statusCode ?? 0;
          if (status < 200 || status >= 300) {
            reject(new Error(`LIVE_CLIENT_HTTP_${status || 'NO_STATUS'}`));
            return;
          }
          try {
            resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')) as T);
          } catch {
            reject(new Error('LIVE_CLIENT_RESPONSE_INVALID_JSON'));
          }
        });
      },
    );
    request.setTimeout(1_500, () => request.destroy(new Error('LIVE_CLIENT_TIMEOUT')));
    request.on('error', reject);
    request.end();
  });
}

export async function readDuelFirstBlood(): Promise<DuelFirstBloodSnapshot | null> {
  const [events, activePlayer] = await Promise.all([
    getJson<LiveClientEvents>('/liveclientdata/eventdata'),
    getJson<LiveActivePlayer>('/liveclientdata/activeplayer'),
  ]);
  return parseDuelFirstBlood(events, activePlayer);
}
