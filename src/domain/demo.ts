import type { MatchParticipant, Role } from './types';

const roleOrder: Role[] = ['TOP', 'JUNGLE', 'MID', 'ADC', 'SUPPORT'];

export function createDemoParticipants(
  currentPlayerId: string,
  currentGameName: string,
  currentTagLine: string,
  currentRole: Role,
): MatchParticipant[] {
  const participants: MatchParticipant[] = Array.from({ length: 10 }, (_, index) => ({
    id: index === 2 ? currentPlayerId : `demo-player-${index + 1}`,
    gameName: index === 2 ? currentGameName : `Player${String(index + 1).padStart(2, '0')}`,
    tagLine: index === 2 ? currentTagLine : 'EUW',
    team: index < 5 ? 'BLUE' : 'RED',
    role: roleOrder[index % 5],
    joined: false,
    isCurrentPlayer: index === 2,
  }));

  const me = participants.find((participant) => participant.isCurrentPlayer);
  const teammateWithRole = participants.find(
    (participant) => participant.team === 'BLUE' && participant.role === currentRole && !participant.isCurrentPlayer,
  );
  if (me && teammateWithRole) {
    const previousRole = me.role;
    me.role = currentRole;
    teammateWithRole.role = previousRole;
  }
  return participants;
}

export function createDemoDuelParticipants(
  currentPlayerId: string,
  currentGameName: string,
  currentTagLine: string,
): MatchParticipant[] {
  return [
    {
      id: currentPlayerId,
      gameName: currentGameName,
      tagLine: currentTagLine,
      team: 'BLUE',
      role: 'MID',
      joined: false,
      isCurrentPlayer: true,
    },
    {
      id: 'demo-duel-opponent',
      gameName: 'Showdown Opponent',
      tagLine: 'EUW',
      team: 'RED',
      role: 'MID',
      joined: false,
      isCurrentPlayer: false,
    },
  ];
}

export function createLocalBotParticipants(
  currentPlayerId: string,
  currentGameName: string,
  currentTagLine: string,
  currentRole: Role,
): MatchParticipant[] {
  return createDemoParticipants(currentPlayerId, currentGameName, currentTagLine, currentRole)
    .map((participant) => participant.isCurrentPlayer
      ? participant
      : {
          ...participant,
          gameName: `${participant.team === 'BLUE' ? 'Ally' : 'Enemy'} ${participant.role} Bot`,
          tagLine: 'BOT',
        });
}

export function createDemoLobby(): { name: string; password: string } {
  return { name: 'W3C-F39A2B', password: '7HK92N4D' };
}
