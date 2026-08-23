import https from 'node:https';
import type { DuelVictorySnapshot } from './types.js';

const LIVE_CLIENT_PORT = 2999;
const MAX_RESPONSE_BYTES = 1024 * 1024;

interface LiveClientEvent {
  EventID?: unknown;
  EventName?: unknown;
  EventTime?: unknown;
  KillerName?: unknown;
  VictimName?: unknown;
  TurretKilled?: unknown;
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

interface LivePlayerScores {
  creepScore?: unknown;
}

interface LivePlayer {
  summonerName?: unknown;
  riotId?: unknown;
  riotIdGameName?: unknown;
  riotIdTagLine?: unknown;
  team?: unknown;
  scores?: LivePlayerScores;
}

interface LiveGameStats {
  gameTime?: unknown;
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

function playerAliases(player: LiveActivePlayer | LivePlayer): Set<string> {
  return activePlayerAliases(player);
}

function matchesAliases(player: LivePlayer, aliases: Set<string>): boolean {
  return [...playerAliases(player)].some((alias) => aliases.has(alias));
}

function validEvent(event: LiveClientEvent): boolean {
  return typeof event.EventID === 'number' &&
    Number.isSafeInteger(event.EventID) &&
    typeof event.EventTime === 'number' &&
    Number.isFinite(event.EventTime) &&
    event.EventTime >= 0;
}

function normalizedTeam(value: unknown): 'ORDER' | 'CHAOS' | null {
  return value === 'ORDER' || value === 'CHAOS' ? value : null;
}

function destroyedTurretTeam(value: unknown): 'ORDER' | 'CHAOS' | null {
  if (typeof value !== 'string') return null;
  const match = /(?:^|_)T([12])(?:_|$)/i.exec(value);
  if (!match) return null;
  return match[1] === '1' ? 'ORDER' : 'CHAOS';
}

function displayName(player: LivePlayer | undefined, fallback: string): string {
  const value = player?.riotIdGameName ?? player?.summonerName;
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

export function parseDuelVictory(
  payload: LiveClientEvents,
  activePlayer: LiveActivePlayer,
  playerList: LivePlayer[] = [],
  gameTimeSeconds = 0,
): DuelVictorySnapshot | null {
  if (!Array.isArray(payload.Events)) return null;
  const aliases = activePlayerAliases(activePlayer);
  if (aliases.size === 0) return null;

  const localPlayer = playerList.find((player) => matchesAliases(player, aliases));
  const localTeam = normalizedTeam(localPlayer?.team);
  const opponent = localTeam
    ? playerList.find((player) => normalizedTeam(player.team) !== null && player.team !== localTeam)
    : undefined;
  const candidates: DuelVictorySnapshot[] = [];

  const championKills = (payload.Events as LiveClientEvent[])
    .filter((event) => event.EventName === 'ChampionKill')
    .filter(
      (event) =>
        validEvent(event) &&
        typeof event.KillerName === 'string' &&
        typeof event.VictimName === 'string',
    )
    .sort((left, right) =>
      (left.EventTime as number) - (right.EventTime as number) ||
      (left.EventID as number) - (right.EventID as number),
    );
  const firstBlood = championKills[0];
  if (firstBlood) {
    const killer = normalizedName(firstBlood.KillerName);
    const victim = normalizedName(firstBlood.VictimName);
    const localPlayerWon = killer ? aliases.has(killer) : false;
    const localPlayerLost = victim ? aliases.has(victim) : false;
    if (localPlayerWon !== localPlayerLost) {
      candidates.push({
        condition: 'FIRST_BLOOD',
        eventId: firstBlood.EventID as number,
        eventTimeSeconds: firstBlood.EventTime as number,
        winnerName: firstBlood.KillerName as string,
        loserName: firstBlood.VictimName as string,
        winnerValue: 1,
        loserValue: 0,
        localPlayerWon,
      });
    }
  }

  if (localPlayer && localTeam && opponent) {
    const firstTurret = (payload.Events as LiveClientEvent[])
      .filter((event) => event.EventName === 'TurretKilled' && validEvent(event))
      .map((event) => ({ event, destroyedTeam: destroyedTurretTeam(event.TurretKilled) }))
      .filter((candidate) => candidate.destroyedTeam !== null)
      .sort((left, right) =>
        (left.event.EventTime as number) - (right.event.EventTime as number) ||
        (left.event.EventID as number) - (right.event.EventID as number),
      )[0];
    if (firstTurret?.destroyedTeam) {
      const turretWonLocally = firstTurret.destroyedTeam !== localTeam;
      candidates.push({
        condition: 'FIRST_TURRET',
        eventId: firstTurret.event.EventID as number,
        eventTimeSeconds: firstTurret.event.EventTime as number,
        winnerName: turretWonLocally
          ? displayName(localPlayer, 'Local player')
          : displayName(opponent, 'Opponent'),
        loserName: turretWonLocally
          ? displayName(opponent, 'Opponent')
          : displayName(localPlayer, 'Local player'),
        winnerValue: 1,
        loserValue: 0,
        localPlayerWon: turretWonLocally,
      });
    }
  }

  if (candidates.length > 0) {
    return candidates.sort((left, right) =>
      left.eventTimeSeconds - right.eventTimeSeconds ||
      (left.eventId ?? 0) - (right.eventId ?? 0),
    )[0];
  }

  const localCreepScore = localPlayer?.scores?.creepScore;
  const opponentCreepScore = opponent?.scores?.creepScore;
  if (
    !localPlayer || !opponent ||
    typeof localCreepScore !== 'number' || !Number.isFinite(localCreepScore) ||
    typeof opponentCreepScore !== 'number' || !Number.isFinite(opponentCreepScore)
  ) return null;
  if (localCreepScore < 100 && opponentCreepScore < 100) return null;
  if (localCreepScore === opponentCreepScore) return null;

  const creepScoreWonLocally = localCreepScore > opponentCreepScore;
  return {
    condition: 'CREEP_SCORE_100',
    eventTimeSeconds: Math.max(0, gameTimeSeconds),
    winnerName: creepScoreWonLocally
      ? displayName(localPlayer, 'Local player')
      : displayName(opponent, 'Opponent'),
    loserName: creepScoreWonLocally
      ? displayName(opponent, 'Opponent')
      : displayName(localPlayer, 'Local player'),
    winnerValue: creepScoreWonLocally ? localCreepScore : opponentCreepScore,
    loserValue: creepScoreWonLocally ? opponentCreepScore : localCreepScore,
    localPlayerWon: creepScoreWonLocally,
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

export async function readDuelVictory(): Promise<DuelVictorySnapshot | null> {
  const [events, activePlayer, playerList, gameStats] = await Promise.all([
    getJson<LiveClientEvents>('/liveclientdata/eventdata'),
    getJson<LiveActivePlayer>('/liveclientdata/activeplayer'),
    getJson<LivePlayer[]>('/liveclientdata/playerlist'),
    getJson<LiveGameStats>('/liveclientdata/gamestats'),
  ]);
  const gameTime = typeof gameStats.gameTime === 'number' && Number.isFinite(gameStats.gameTime)
    ? gameStats.gameTime
    : 0;
  return parseDuelVictory(events, activePlayer, Array.isArray(playerList) ? playerList : [], gameTime);
}
