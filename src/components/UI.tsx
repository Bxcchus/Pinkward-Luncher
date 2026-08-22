import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Icon, type IconName } from './Icon';

type ButtonTone = 'primary' | 'secondary' | 'destructive' | 'ghost' | 'success';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  tone?: ButtonTone;
  icon?: IconName;
  fullWidth?: boolean;
}

export function Button({ tone = 'secondary', icon, fullWidth, className = '', children, ...props }: ButtonProps) {
  return (
    <button
      type="button"
      className={`button button--${tone}${fullWidth ? ' button--wide' : ''} ${className}`.trim()}
      {...props}
    >
      {icon && <Icon name={icon} size={17} />}
      <span>{children}</span>
    </button>
  );
}

export function Alert({ tone = 'error', title, children }: { tone?: 'error' | 'warning' | 'info'; title?: string; children: ReactNode }) {
  return (
    <div className={`alert alert--${tone}`} role={tone === 'error' ? 'alert' : 'status'}>
      <Icon name={tone === 'error' ? 'shield' : tone === 'warning' ? 'spark' : 'server'} size={18} />
      <div>{title && <strong>{title}</strong>}<span>{children}</span></div>
    </div>
  );
}

export function Dialog({ eyebrow, title, description, children, footer }: { eyebrow: string; title: string; description: string; children: ReactNode; footer?: ReactNode }) {
  return (
    <section className="dialog" role="dialog" aria-labelledby="dialog-title" aria-describedby="dialog-description">
      <header>
        <span className="eyebrow">{eyebrow}</span>
        <h1 id="dialog-title">{title}</h1>
        <p id="dialog-description">{description}</p>
      </header>
      <div className="dialog__body">{children}</div>
      {footer && <footer className="dialog__footer">{footer}</footer>}
    </section>
  );
}

export function EmptyState({ icon = 'history', title, description, action }: { icon?: IconName; title: string; description: string; action?: ReactNode }) {
  return (
    <div className="empty-state">
      <span><Icon name={icon} size={22} /></span>
      <strong>{title}</strong>
      <p>{description}</p>
      {action}
    </div>
  );
}

export function Toast({ children }: { children: ReactNode }) {
  return <div className="toast" role="status"><Icon name="check" size={17} /><span>{children}</span></div>;
}

export function Skeleton({ lines = 3 }: { lines?: number }) {
  return <div className="skeleton" aria-label="Loading">{Array.from({ length: lines }, (_, index) => <i key={index} />)}</div>;
}

export function ConnectionStatus({ label, value, tone, icon }: { label: string; value: string; tone: 'success' | 'warning' | 'danger' | 'muted' | 'demo'; icon: IconName }) {
  return (
    <div className="connection-status">
      <Icon name={icon} size={17} />
      <span><small>{label}</small><strong>{value}</strong></span>
      <i className={`status-dot status-dot--${tone}`} />
    </div>
  );
}
