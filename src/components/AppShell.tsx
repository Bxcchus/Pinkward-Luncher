import type { ReactNode } from 'react';
import type { AppScreen, AppState } from '../domain/types';
import type { AppController } from '../hooks/useAppController';
import { Brand } from './Brand';
import { Icon, type IconName } from './Icon';
import { LeagueBadge, ServerBadge } from './StatusBadge';

const activeFlowScreens = new Set<AppScreen>([
  'SEARCHING',
  'READY_CHECK',
  'CREATING_MATCH',
  'JOINING_LOBBY',
  'MATCH_OVERVIEW',
]);

interface ShellProps {
  state: AppState;
  controller: AppController;
  children: ReactNode;
}

export function AppShell({ state, controller, children }: ShellProps) {
  const isInGame = state.lifecycle === 'IN_GAME';
  const locked = activeFlowScreens.has(state.screen);
  const items: Array<{
    screen: 'HOME' | 'PLAY' | 'HISTORY' | 'SETTINGS';
    label: string;
    icon: IconName;
  }> = [
    { screen: 'HOME', label: 'Home', icon: 'home' },
    { screen: 'PLAY', label: 'Play', icon: 'play' },
    { screen: 'HISTORY', label: 'Match history', icon: 'history' },
    { screen: 'SETTINGS', label: 'Settings', icon: 'settings' },
  ];

  if (isInGame) {
    return <main className="ingame-shell">{children}</main>;
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Brand />
        <nav className="sidebar__nav" aria-label="Main navigation">
          <span className="sidebar__label">COMPANION</span>
          {items.map((item) => {
            const active =
              state.screen === item.screen ||
              (item.screen === 'PLAY' && activeFlowScreens.has(state.screen)) ||
              (item.screen === 'HISTORY' && state.screen === 'POST_GAME');
            return (
              <button
                key={item.screen}
                type="button"
                className={active ? 'nav-item nav-item--active' : 'nav-item'}
                onClick={() => controller.navigate(item.screen)}
                disabled={locked && !active}
              >
                <Icon name={item.icon} size={19} />
                <span>{item.label}</span>
                {active && <i />}
              </button>
            );
          })}
        </nav>
        {locked && (
          <div className="active-session-card">
            <span className="pulse-mini" />
            <div>
              <strong>Match session active</strong>
              <small>{state.screen.replaceAll('_', ' ')}</small>
            </div>
          </div>
        )}
        <div className="sidebar__profile">
          <div className="avatar">{state.player?.gameName.slice(0, 1).toUpperCase()}</div>
          <div>
            <strong>{state.player?.gameName}</strong>
            <small>#{state.player?.tagLine} · {state.player?.region}</small>
          </div>
          <button type="button" className="icon-button" onClick={controller.logout} aria-label="Log out">
            <Icon name="logout" size={17} />
          </button>
        </div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div className="topbar__season">
            <span>SEASON ZERO</span>
            <i />
            <small>EUW CLOSED ALPHA</small>
          </div>
          <div className="topbar__statuses">
            <ServerBadge status={state.serverStatus} />
            <LeagueBadge status={state.league} />
            <button type="button" className="icon-button notification-button" aria-label="Notifications">
              <Icon name="bell" size={18} />
              <i />
            </button>
          </div>
        </header>
        <main className="content">{children}</main>
      </section>
    </div>
  );
}
