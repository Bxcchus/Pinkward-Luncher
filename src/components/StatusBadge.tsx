import { Icon } from './Icon';
import type { LeagueStatus, ServerStatus } from '../domain/types';

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

export function LeagueBadge({ status }: { status: LeagueStatus }) {
  return (
    <div className="status-badge" title={status.detail}>
      <Icon name="league" size={16} />
      <span>League</span>
      <i className={`status-dot status-dot--${statusTone(status.state)}`} />
      <strong>{status.state.replace('_', ' ')}</strong>
    </div>
  );
}
