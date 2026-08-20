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
              <h3>{team} SIDE</h3>
            </div>
            <span className="team-score">5 / 5</span>
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
                  {participant.isCurrentPlayer && <span className="you-pill">YOU</span>}
                  <Icon name="check" size={16} className="team-player__check" />
                </div>
              ))}
          </div>
        </section>
      ))}
    </div>
  );
}
