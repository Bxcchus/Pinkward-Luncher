import { Icon } from './Icon';

export function WindowControls() {
  if (!window.w3c) return null;

  return (
    <div className="window-controls" aria-label="Window controls">
      <button type="button" onClick={() => window.w3c?.window.minimize()} aria-label="Minimize window">
        <Icon name="minimize" size={14} />
      </button>
      <button type="button" onClick={() => window.w3c?.window.toggleMaximize()} aria-label="Maximize window">
        <Icon name="maximize" size={13} />
      </button>
      <button type="button" className="window-control--close" onClick={() => window.w3c?.window.close()} aria-label="Close window">
        <Icon name="close" size={14} />
      </button>
    </div>
  );
}
