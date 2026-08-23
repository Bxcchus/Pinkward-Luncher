import { Icon } from './Icon';
import type { LeagueStatus, ServerStatus } from '../domain/types';
import { LeagueMark } from './LeagueMark';

function statusTone(status: string): 'success' | 'warning' | 'danger' | 'muted' | 'demo' {
  if (status === 'CONNECTED') return 'success';
  if (status === 'SIMULATION') return 'demo';
  if (status === 'CONNECTING' || status === 'STARTING') return 'warning';
  if (status === 'DISCONNECTED' || status === 'NOT_INSTALLED') return 'danger';
  return 'muted';
}

export function ServerBadge({ status }: { status: ServerStatus }) {
  return (
    <div className="status-badge" title={`Backend: ${status}`}>
      <Icon name="server" size={16} />
      <span>Server</span>
      <i className={`status-dot status-dot--${statusTone(status)}`} />
      <strong>{status === 'SIMULATION' ? 'DEMO' : status}</strong>
    </div>
  );
}

export function LeagueBadge({ status, simulated = false }: { status: LeagueStatus; simulated?: boolean }) {
  return (
    <div className="status-badge" title={simulated ? 'League integration is simulated in this web demo.' : status.detail}>
      <LeagueMark size={16} />
      <span>League</span>
      <i className={`status-dot status-dot--${simulated ? 'demo' : statusTone(status.state)}`} />
      <strong>{simulated ? 'SIMULATED' : status.state.replace('_', ' ')}</strong>
    </div>
  );
}
