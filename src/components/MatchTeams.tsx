import type { MatchParticipant } from '../domain/types';
import { RoleGlyph } from './RoleSelector';
import { Icon } from './Icon';

export function MatchTeams({ participants }: { participants: MatchParticipant[] }) {
  return (
    <div className="teams-grid">
      {(['BLUE', 'RED'] as const).map((team) => (
        <section className={`team-card team-card--${team.toLowerCase()}`} key={team}>
          <header>
            <div>
              <span className="eyebrow">ASSIGNED TEAM</span>
              <h3>{team === 'BLUE' ? 'Blue team' : 'Red team'}</h3>
            </div>
            <span className="team-score">{participants.filter((participant) => participant.team === team).length} players</span>
          </header>
          <div className="team-list">
            {participants
              .filter((participant) => participant.team === team)
              .map((participant) => (
                <div
                  className={participant.isCurrentPlayer ? 'team-player team-player--me' : 'team-player'}
                  key={participant.id}
                >
                  <RoleGlyph role={participant.role} size="small" />
                  <div>
                    <strong>{participant.gameName}</strong>
                    <small>#{participant.tagLine}</small>
                  </div>
                  <span className="player-role">{participant.role}</span>
                  {participant.isCurrentPlayer && <span className="you-pill">YOU</span>}
                  <Icon name={participant.joined ? 'check' : 'clock'} size={16} className={participant.joined ? 'team-player__check' : 'team-player__pending'} />
                </div>
              ))}
          </div>
        </section>
      ))}
    </div>
  );
}
