import type { ReactNode } from 'react';
import type { AppScreen, AppState } from '../domain/types';
import type { AppController } from '../hooks/useAppController';
import { Brand } from './Brand';
import { Icon, type IconName } from './Icon';
import { LeagueBadge, ServerBadge } from './StatusBadge';
import { WindowControls } from './WindowControls';
import { LeagueMark } from './LeagueMark';
import { SummonerAvatar } from './SummonerAvatar';
import { isWebDemo } from '../services/runtimeConfig';
import { DemoLegalNav } from './DemoLegalNav';

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
  const locked = activeFlowScreens.has(state.screen);
  const leagueDisconnected = !state.settings.demoMode && !state.league.running;
  const items: Array<{ screen: 'HOME' | 'PLAY' | 'HISTORY' | 'CHAT' | 'SETTINGS'; label: string; icon: IconName }> = [
    { screen: 'HOME', label: 'Home', icon: 'home' },
    { screen: 'PLAY', label: 'Matchmaking', icon: 'play' },
    { screen: 'HISTORY', label: 'History', icon: 'history' },
    { screen: 'CHAT', label: 'Community', icon: 'chat' },
    { screen: 'SETTINGS', label: 'Settings', icon: 'settings' },
  ];

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Brand />
        <nav className="sidebar__nav" aria-label="Main navigation">
          {items.map((item) => {
            const active = state.screen === item.screen
              || (item.screen === 'PLAY' && activeFlowScreens.has(state.screen))
              || (item.screen === 'HISTORY' && state.screen === 'POST_GAME');
            return (
              <button
                key={item.screen}
                type="button"
                className={active ? 'nav-item nav-item--active' : 'nav-item'}
                onClick={() => controller.navigate(item.screen)}
                disabled={locked && !active}
                aria-current={active ? 'page' : undefined}
              >
                <Icon name={item.icon} size={19} />
                <span>{item.label}</span>
                {item.screen === 'CHAT' && state.unreadChatMessages > 0 && (
                  <em className="nav-unread" aria-label={`${state.unreadChatMessages} unread messages`}>
                    {state.unreadChatMessages}
                  </em>
                )}
              </button>
            );
          })}
        </nav>

        <div className="sidebar__footer">
          {locked && (
            <div className="active-session-card">
              <span className="pulse-mini" />
              <div><strong>Active session</strong><small>{state.screen.replaceAll('_', ' ').toLowerCase()}</small></div>
            </div>
          )}
          {isWebDemo && <DemoLegalNav compact />}
          <div className="sidebar-status" aria-label="Connection summary">
            <div><i className={`status-dot status-dot--${state.serverStatus === 'DISCONNECTED' ? 'danger' : state.serverStatus === 'SIMULATION' ? 'demo' : 'success'}`} /><span>Server</span><strong>{state.serverStatus === 'SIMULATION' ? 'Demo' : state.serverStatus.toLowerCase()}</strong></div>
            <div><i className={`status-dot status-dot--${isWebDemo ? 'demo' : state.league.running ? 'success' : 'warning'}`} /><span>League</span><strong>{isWebDemo ? 'Simulated' : state.league.running ? 'Detected' : 'Closed'}</strong></div>
          </div>
        </div>
      </aside>

      <section className={isWebDemo ? 'workspace workspace--web-demo' : 'workspace'}>
        <header className="topbar">
          <div className="topbar__identity">
            <SummonerAvatar
              gameName={state.player?.gameName}
              profileIconDataUrl={state.player?.profileIconDataUrl}
            />
            <div>
              <strong>{state.player?.gameName}<span>#{state.player?.tagLine}</span></strong>
              <small>{isWebDemo ? 'Interactive local simulation' : 'Verified League session'}</small>
            </div>
            <span className="region-badge">{state.player?.region}</span>
          </div>
          <div className="topbar__statuses">
            <ServerBadge status={state.serverStatus} />
            <LeagueBadge status={state.league} simulated={isWebDemo} />
            <button type="button" className="icon-button" onClick={() => controller.navigate('SETTINGS')} aria-label="Open settings" disabled={locked && state.screen !== 'SETTINGS'}>
              <Icon name="settings" size={18} />
            </button>
            <button type="button" className="icon-button" onClick={controller.logout} aria-label="Log out">
              <Icon name="logout" size={17} />
            </button>
            <WindowControls />
          </div>
        </header>

        {isWebDemo && (
          <div className="web-demo-banner" role="status">
            <Icon name="shield" size={17} />
            <span><strong>Web demo.</strong> Every action is simulated locally; no Riot account, League Client or API key is used.</span>
          </div>
        )}
        {leagueDisconnected && (
          <div className="league-disconnected-banner" role="alert">
            <LeagueMark size={18} />
            <span><strong>League Client is closed.</strong> Open it and sign in; your profile will be detected automatically.</span>
            <button type="button" onClick={() => void controller.openLeague()}>Open League</button>
          </div>
        )}
        <main className="content">{children}</main>
      </section>
    </div>
  );
}
