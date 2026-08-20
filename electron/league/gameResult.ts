import type { LeagueGameResultSnapshot } from './types.js';

interface MatchHistoryTeam {
  teamId?: number;
  win?: string;
}

interface MatchHistoryParticipant {
  teamId?: number;
  stats?: { kills?: number };
}

interface MatchHistoryGame {
  gameId?: number;
  gameDuration?: number;
  mapId?: number;
  queueId?: number;
  participants?: MatchHistoryParticipant[];
  teams?: MatchHistoryTeam[];
}

const teamWon = (team: MatchHistoryTeam | undefined): boolean =>
  team?.win?.toLowerCase() === 'win';

const teamKills = (participants: MatchHistoryParticipant[], teamId: number): number | null => {
  const team = participants.filter((participant) => participant.teamId === teamId);
  if (team.length !== 5 || team.some((participant) => !Number.isInteger(participant.stats?.kills))) {
    return null;
  }
  return team.reduce((total, participant) => total + (participant.stats?.kills ?? 0), 0);
};

export function parseLeagueGameResult(
  value: unknown,
  expectedGameId: number,
): LeagueGameResultSnapshot | null {
  if (!value || typeof value !== 'object') return null;
  const game = value as MatchHistoryGame;
  if (
    game.gameId !== expectedGameId ||
    game.queueId !== 3100 ||
    game.mapId !== 11 ||
    !Array.isArray(game.participants) ||
    game.participants.length !== 10 ||
    !Array.isArray(game.teams)
  ) {
    return null;
  }

  const blueWon = teamWon(game.teams.find((team) => team.teamId === 100));
  const redWon = teamWon(game.teams.find((team) => team.teamId === 200));
  const outcome = blueWon === redWon ? 'UNKNOWN' : blueWon ? 'BLUE_WIN' : 'RED_WIN';
  const durationSeconds = Number.isInteger(game.gameDuration) && (game.gameDuration ?? 0) >= 0
    ? game.gameDuration
    : undefined;
  const blueKills = teamKills(game.participants, 100);
  const redKills = teamKills(game.participants, 200);

  return {
    gameId: expectedGameId,
    outcome,
    diagnosticCode: outcome === 'UNKNOWN' ? 'LCU_RESULT_NO_SINGLE_WINNER' : 'LCU_RESULT_OBSERVED',
    ...(durationSeconds === undefined ? {} : { durationSeconds }),
    ...(outcome === 'UNKNOWN' || blueKills === null || redKills === null
      ? {}
      : { score: `${blueKills} – ${redKills}` }),
  };
}
