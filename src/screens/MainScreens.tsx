import type { AppController } from '../hooks/useAppController';
import type { AppState, MatchLifecycle } from '../domain/types';
import { Icon } from '../components/Icon';
import { MatchTeams } from '../components/MatchTeams';
import { RoleGlyph, RoleSelector } from '../components/RoleSelector';

const seconds = (value: number): string =>
  `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`;

function PageHeading({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) {
  return (
    <header className="page-heading">
      <div>
        <span className="eyebrow">{eyebrow}</span>
        <h1>{title}</h1>
      </div>
      <p>{description}</p>
    </header>
  );
}

export function HomeScreen({ controller }: { controller: AppController }) {
  const { state } = controller;
  return (
    <div className="screen screen--home">
      <PageHeading
        eyebrow="COMMAND CENTER"
        title={`Welcome back, ${state.player?.gameName}`}
        description="Your next balanced community match is one click away."
      />
      <section className="hero-card">
        <div className="hero-card__glow" />
        <div className="hero-card__content">
          <span className="eyebrow eyebrow--gold">RANKED COMMUNITY DRAFT</span>
          <h2>Ready for the Rift?</h2>
          <p>Choose two roles and join players looking for serious, coordinated games.</p>
          <button type="button" className="button button--primary" onClick={() => controller.navigate('PLAY')}>
            <Icon name="play" size={17} />
            <span>FIND A MATCH</span>
          </button>
        </div>
        <div className="hero-emblem" aria-hidden="true"><span>W</span></div>
        <div className="hero-card__stats">
          <div><strong>{state.playersSearching}</strong><small>SEARCHING NOW</small></div>
          <i />
          <div><strong>~{seconds(state.estimatedWaitSeconds)}</strong><small>ESTIMATED WAIT</small></div>
        </div>
      </section>
      <div className="dashboard-grid">
        <section className="panel stats-panel">
          <header><div><span className="eyebrow">YOUR SEASON</span><h3>Performance</h3></div><span className="season-pill">S0</span></header>
          <div className="stat-ring"><div><strong>58%</strong><small>WIN RATE</small></div></div>
          <div className="mini-stats">
            <div><strong>24</strong><small>Matches</small></div>
            <div><strong>14</strong><small>Wins</small></div>
            <div><strong>10</strong><small>Losses</small></div>
          </div>
        </section>
        <section className="panel recent-panel">
          <header><div><span className="eyebrow">LATEST GAMES</span><h3>Recent form</h3></div><button type="button" className="text-button" onClick={() => controller.navigate('HISTORY')}>VIEW ALL <Icon name="arrow" size={14} /></button></header>
          {state.history.slice(0, 3).map((match) => (
            <div className="recent-match" key={match.id}>
              <i className={`result-bar result-bar--${match.result.toLowerCase()}`} />
              <RoleGlyph role={match.role} />
              <div><strong>{match.result}</strong><small>{new Date(match.playedAt).toLocaleDateString()}</small></div>
              <span>{match.score}</span>
              <small>{seconds(match.durationSeconds)}</small>
            </div>
          ))}
        </section>
        <section className="panel service-panel">
          <span className={`service-orb ${state.league.running ? 'service-orb--online' : ''}`}><Icon name="league" size={28} /></span>
          <div><span className="eyebrow">LEAGUE CLIENT</span><h3>{state.league.state.replace('_', ' ')}</h3><p>{state.league.detail}</p></div>
          {!state.league.running && <button type="button" className="button button--secondary button--small" onClick={() => void controller.openLeague()}>OPEN LEAGUE</button>}
        </section>
      </div>
    </div>
  );
}

export function PlayScreen({ controller }: { controller: AppController }) {
  const { state } = controller;
  const leagueReady = state.league.running && state.league.automationAvailable && state.league.adapterHealthy;
  const leagueLabel = leagueReady
    ? 'READY'
    : state.league.running
      ? 'MANUAL FALLBACK'
      : 'CLIENT UNAVAILABLE';
  return (
    <div className="screen">
      <PageHeading eyebrow="MATCHMAKING" title="Choose your roles" description="Primary is prioritized first. Secondary expands the search when needed." />
      <div className="play-layout">
        <div className="role-stack">
          <RoleSelector label="PRIMARY ROLE" hint="Your strongest and preferred position." value={state.primaryRole} excluded={state.secondaryRole} onChange={controller.setPrimaryRole} />
          <RoleSelector label="SECONDARY ROLE" hint="A position you are comfortable filling." value={state.secondaryRole} excluded={state.primaryRole} onChange={controller.setSecondaryRole} />
        </div>
        <aside className="queue-card">
          <div className="queue-card__emblem"><RoleGlyph role={state.primaryRole} size="large" /><span>+</span><RoleGlyph role={state.secondaryRole} size="large" /></div>
          <span className="eyebrow">YOUR QUEUE</span>
          <h2>{state.primaryRole} <small>/</small> {state.secondaryRole}</h2>
          <div className="queue-metrics">
            <div><Icon name="users" /><span><strong>{state.playersSearching}</strong><small>players searching</small></span></div>
            <div><Icon name="clock" /><span><strong>~{seconds(state.estimatedWaitSeconds)}</strong><small>estimated wait</small></span></div>
          </div>
          <div className="readiness-list">
            <div><span><i className={`status-dot status-dot--${state.serverStatus === 'DISCONNECTED' ? 'danger' : 'success'}`} />Matchmaking server</span><strong>{state.serverStatus === 'DISCONNECTED' ? 'OFFLINE' : 'READY'}</strong></div>
            <div><span><i className={`status-dot status-dot--${leagueReady ? 'success' : 'warning'}`} />League Client</span><strong>{leagueLabel}</strong></div>
          </div>
          {state.error && <div className="inline-alert inline-alert--error">{state.error}</div>}
          <button type="button" className="button button--primary button--wide button--large" onClick={() => void controller.findMatch()} disabled={state.serverStatus === 'DISCONNECTED' && !state.settings.demoMode}>
            <Icon name="search" size={19} />
            <span>FIND MATCH</span>
          </button>
          <p className="queue-note"><Icon name="shield" size={14} /> The server assigns teams and controls every transition.</p>
        </aside>
      </div>
    </div>
  );
}

export function SearchingScreen({ controller }: { controller: AppController }) {
  const { state } = controller;
  return (
    <div className="screen flow-screen">
      <div className="search-visual" aria-hidden="true">
        <div className="search-orbit search-orbit--one" />
        <div className="search-orbit search-orbit--two" />
        <div className="search-core"><Icon name="search" size={34} /></div>
        {[0, 1, 2, 3, 4].map((item) => <i key={item} style={{ '--index': item } as React.CSSProperties} />)}
      </div>
      <span className="eyebrow eyebrow--gold">MATCHMAKING ACTIVE</span>
      <h1>SEARCHING<span className="animated-dots">...</span></h1>
      <p>{state.settings.duelMode
        ? <>Waiting for one friend for a <strong>1v1</strong> test</>
        : <>Finding a role-balanced match for <strong>{state.primaryRole}</strong> / {state.secondaryRole}</>}</p>
      <div className="flow-metrics">
        <div><span>TIME IN QUEUE</span><strong>{seconds(state.queueElapsedSeconds)}</strong></div>
        <i />
        <div><span>ESTIMATED WAIT</span><strong>{state.settings.duelMode ? '1 friend' : `~${seconds(state.estimatedWaitSeconds)}`}</strong></div>
        <i />
        <div><span>PLAYERS SEARCHING</span><strong>{state.playersSearching}</strong></div>
      </div>
      <button type="button" className="button button--ghost" onClick={() => void controller.leaveQueue()}>LEAVE QUEUE</button>
      <div className="flow-tip"><Icon name="shield" size={16} /><span>{state.settings.duelMode ? 'The first player creates the lobby; the second joins the opposing team.' : 'Primary-only matchmaking is prioritized during the first minute.'}</span></div>
    </div>
  );
}

export function ReadyCheckScreen({ controller }: { controller: AppController }) {
  const { state } = controller;
  return (
    <div className="screen flow-screen ready-screen">
      <div className="ready-aura" aria-hidden="true" />
      <span className="eyebrow eyebrow--gold">MATCH FOUND</span>
      <h1>{state.acceptedByMe ? 'WAITING FOR PLAYERS' : 'READY CHECK'}</h1>
      <p>{state.acceptedByMe ? 'Your place is secured. Waiting for the remaining players.' : 'Confirm that you are ready to play.'}</p>
      <div className="acceptance-ring" style={{ '--progress': `${(state.acceptedCount / 10) * 360}deg` } as React.CSSProperties}>
        <div><strong>{state.acceptedCount}</strong><span>/ 10</span><small>ACCEPTED</small></div>
      </div>
      <div className="acceptance-slots">
        {Array.from({ length: 10 }, (_, index) => <i key={index} className={index < state.acceptedCount ? 'accepted' : ''}>{index < state.acceptedCount && <Icon name="check" size={14} />}</i>)}
      </div>
      {!state.acceptedByMe ? (
        <div className="ready-actions">
          <button type="button" className="button button--ghost" onClick={() => void controller.declineReadyCheck()}>DECLINE</button>
          <button type="button" className="button button--accept" onClick={() => void controller.acceptReadyCheck()}><Icon name="check" /> ACCEPT <span>{state.readySecondsLeft}s</span></button>
        </div>
      ) : (
        <div className="accepted-confirmation"><Icon name="check" /> YOU ACCEPTED <span>{state.readySecondsLeft}s</span></div>
      )}
    </div>
  );
}

const creationSteps = ['Teams assigned', 'Secure lobby prepared', 'League coordination checked'];

export function CreatingMatchScreen({ controller }: { controller: AppController }) {
  const { state } = controller;
  if (state.manualCreate && state.lobby) {
    return (
      <div className="screen flow-screen manual-create-screen">
        <span className="fallback-icon manual-create-icon"><Icon name="external" size={27} /></span>
        <span className="eyebrow eyebrow--gold">LOCAL AUTOMATION UNAVAILABLE</span>
        <h1>CREATE THE CUSTOM GAME</h1>
        <p>This fallback instruction is visible only on this companion. Match authority stays with the server.</p>
        <section className="manual-create-card">
          <div className="manual-steps">
            <div><i>1</i><span><strong>Open League</strong><small>Navigate to Play → Custom Game → Create.</small></span></div>
            <div><i>2</i><span><strong>Use these exact credentials</strong><small>Do not change the assigned name or password.</small></span></div>
            <div><i>3</i><span><strong>Confirm once it exists</strong><small>W3C-LoL will continue coordinating players and validation.</small></span></div>
          </div>
          <div className="manual-credentials">
            <div className="credential">
              <span>LOBBY NAME</span><strong>{state.lobby.name}</strong>
              <button type="button" onClick={() => void controller.copyText(state.lobby!.name, 'Lobby name')} aria-label="Copy lobby name"><Icon name="copy" size={17} /></button>
            </div>
            <div className="credential">
              <span>PASSWORD</span><strong>{state.lobby.password}</strong>
              <button type="button" onClick={() => void controller.copyText(state.lobby!.password, 'Password')} aria-label="Copy password"><Icon name="copy" size={17} /></button>
            </div>
            <button type="button" className="button button--secondary button--wide" onClick={() => void controller.openLeague()}><Icon name="external" size={16} /> OPEN LEAGUE</button>
          </div>
        </section>
        <button
          type="button"
          className="button button--accept manual-confirm"
          onClick={controller.confirmManualLobbyCreated}
          disabled={state.manualCreate.confirmed}
        >
          <Icon name="check" size={18} />
          {state.manualCreate.confirmed ? 'CONFIRMATION SENT' : 'I CREATED THE LOBBY'}
        </button>
        <div className="flow-tip"><Icon name="shield" size={15} /><span>This fallback grants no W3C-LoL team, kick, role, or launch controls.</span></div>
      </div>
    );
  }
  return (
    <div className="screen flow-screen creating-screen">
      <div className="creation-loader"><div /><span>W</span></div>
      <span className="eyebrow eyebrow--gold">10 / 10 ACCEPTED</span>
      <h1>CREATING YOUR MATCH</h1>
      <p>The companion is coordinating a private custom game.</p>
      <div className="creation-steps">
        {creationSteps.map((step, index) => (
          <div key={step} className={index < state.creationStep ? 'creation-step creation-step--done' : index === state.creationStep ? 'creation-step creation-step--active' : 'creation-step'}>
            <i>{index < state.creationStep ? <Icon name="check" size={15} /> : index + 1}</i>
            <span>{step}</span>
            {index === state.creationStep && <small>IN PROGRESS</small>}
          </div>
        ))}
      </div>
      <div className="flow-tip"><span className="spinner-mini" /><span>No player controls teams, participants, or launch timing.</span></div>
    </div>
  );
}

export function JoiningLobbyScreen({ controller }: { controller: AppController }) {
  const { state } = controller;
  return (
    <div className="screen joining-screen">
      <PageHeading eyebrow="LOBBY READY" title="Joining players" description="The roster is filling. Manual credentials remain available if local automation is unavailable." />
      <div className="joining-progress">
        <div><strong>{state.joinedCount}</strong><span>/ 10</span><small>PLAYERS READY</small></div>
        <div className="joining-progress__bar"><i style={{ width: `${state.joinedCount * 10}%` }} /></div>
        <span>{state.joinedCount === 10 ? 'Roster complete' : 'Waiting for League companions…'}</span>
      </div>
      <div className="joining-layout">
        <section className="panel roster-panel">
          <header><div><span className="eyebrow">EXPECTED ROSTER</span><h3>Players</h3></div><span>{state.joinedCount} CONNECTED</span></header>
          <div className="join-list">
            {state.participants.map((participant, index) => (
              <div className={participant.joined ? 'join-player join-player--ready' : 'join-player'} key={participant.id}>
                <span className="join-index">{String(index + 1).padStart(2, '0')}</span>
                <RoleGlyph role={participant.role} size="small" />
                <div><strong>{participant.gameName}</strong><small>{participant.team} · {participant.role}</small></div>
                <span className="join-status">{participant.joined ? <><Icon name="check" size={14} /> JOINED</> : 'CONNECTING'}</span>
              </div>
            ))}
          </div>
        </section>
        <aside className="fallback-card">
          <header><span className="fallback-icon"><Icon name="external" /></span><div><span className="eyebrow">MANUAL FALLBACK</span><h3>Join through League</h3></div></header>
          <p>Local join automation is <strong>UNKNOWN</strong>. These credentials keep the match accessible.</p>
          <div className="credential">
            <span>LOBBY NAME</span><strong>{state.lobby?.name ?? 'Preparing…'}</strong>
            <button type="button" onClick={() => state.lobby && void controller.copyText(state.lobby.name, 'Lobby name')} aria-label="Copy lobby name"><Icon name="copy" size={17} /></button>
          </div>
          <div className="credential">
            <span>PASSWORD</span><strong>{state.lobby?.password ?? '••••••••'}</strong>
            <button type="button" onClick={() => state.lobby && void controller.copyText(state.lobby.password, 'Password')} aria-label="Copy password"><Icon name="copy" size={17} /></button>
          </div>
          <div className="fallback-actions">
            <button type="button" className="button button--secondary" onClick={() => state.lobby && void controller.copyText(`${state.lobby.name}\n${state.lobby.password}`, 'Lobby credentials')}><Icon name="copy" size={16} /> COPY LOBBY</button>
            <button type="button" className="button button--primary" onClick={() => void controller.openLeague()}><Icon name="external" size={16} /> OPEN LEAGUE</button>
          </div>
          <small><Icon name="shield" size={14} /> Teams and launch remain server-controlled.</small>
        </aside>
      </div>
    </div>
  );
}

const lifecycleCopy: Record<MatchLifecycle, { title: string; detail: string }> = {
  MATCH_READY: { title: 'Match ready', detail: 'Roster and roles assigned' },
  LOBBY_OWNER_SELECTED: { title: 'Preparing lobby', detail: 'Orchestration assigned' },
  LOBBY_CREATING: { title: 'Creating game', detail: 'Private lobby requested' },
  LOBBY_READY: { title: 'Lobby ready', detail: 'Credentials distributed securely' },
  PLAYERS_JOINING: { title: 'Players joining', detail: 'Waiting for 10 companions' },
  LOBBY_FULL: { title: '10 / 10 ready', detail: 'All expected players connected' },
  LOBBY_VALIDATING: { title: 'Validating teams', detail: 'Checking roster and side assignments' },
  LOBBY_VALID: { title: 'Lobby validated', detail: 'Roster matches the server plan' },
  STARTING: { title: 'Starting', detail: 'All conditions are satisfied' },
  CHAMP_SELECT: { title: 'Champion select', detail: 'Continue in League Client' },
  IN_GAME: { title: 'In game', detail: 'The match is in progress' },
  POST_GAME: { title: 'Post game', detail: 'Collecting match result' },
  FINISHED: { title: 'Finished', detail: 'Result recorded' },
};

export function MatchOverviewScreen({ controller }: { controller: AppController }) {
  const { state } = controller;
  const lifecycle = state.lifecycle ?? 'LOBBY_VALIDATING';
  if (lifecycle === 'IN_GAME') {
    return (
      <div className="ingame-view">
        <div className="ingame-view__mark">W</div>
        <span className="pulse-mini" />
        <span className="eyebrow">MATCH IN PROGRESS</span>
        <h1>GL HF</h1>
        <p>The companion is staying quiet while League handles the game.</p>
        <div className="ingame-time">{seconds(state.inGameElapsedSeconds)}</div>
        <div className="ingame-status"><i className="status-dot status-dot--success" /> MATCH TRACKING ACTIVE</div>
        {state.settings.demoMode && <button type="button" className="text-button ingame-finish" onClick={controller.finishDemoGame}>FINISH SIMULATED GAME</button>}
      </div>
    );
  }

  return (
    <div className="screen match-screen">
      <PageHeading eyebrow={`MATCH ${state.currentMatchId?.slice(-8).toUpperCase() ?? ''}`} title={lifecycleCopy[lifecycle].title} description={lifecycleCopy[lifecycle].detail} />
      <div className="lifecycle-banner">
        <div className="lifecycle-spinner"><span>W</span></div>
        <div><span className="eyebrow">ORCHESTRATION STATUS</span><h2>{lifecycleCopy[lifecycle].title.toUpperCase()}</h2><p>{lifecycleCopy[lifecycle].detail}</p></div>
        <div className="lifecycle-checks">
          <span><Icon name="check" size={14} /> 10 players connected</span>
          <span className={['LOBBY_VALID', 'STARTING', 'CHAMP_SELECT'].includes(lifecycle) ? '' : 'pending'}><Icon name="check" size={14} /> Teams validated</span>
          <span className={['STARTING', 'CHAMP_SELECT'].includes(lifecycle) ? '' : 'pending'}><Icon name="check" size={14} /> Ready to launch</span>
        </div>
      </div>
      <MatchTeams participants={state.participants} />
      <div className="flow-tip centered-tip"><Icon name="shield" size={16} /><span>Roster and launch are controlled by W3C-LoL. No player receives host controls.</span></div>
    </div>
  );
}

export function PostGameScreen({ controller }: { controller: AppController }) {
  const { state } = controller;
  const result = state.lastResult;
  const pending = result === null;
  return (
    <div className="screen postgame-screen">
      <div className={`result-emblem result-emblem--${pending ? 'pending' : result.result.toLowerCase()}`}><span>{pending ? '…' : result.result === 'LOSS' ? 'L' : 'V'}</span></div>
      <span className="eyebrow eyebrow--gold">{pending ? 'POST GAME' : 'MATCH FINISHED'}</span>
      <h1>{pending ? 'RESULT PENDING' : result.result === 'LOSS' ? 'DEFEAT' : 'VICTORY'}</h1>
      <p>{pending ? 'The server is resolving the authoritative match outcome.' : 'The result has been recorded. Well played.'}</p>
      <div className="postgame-score">
        <span>BLUE</span><strong>{result?.score ?? '—'}</strong><span>RED</span>
      </div>
      <div className="postgame-details">
        <div><RoleGlyph role={result?.role ?? state.primaryRole} size="large" /><span><small>YOUR ROLE</small><strong>{result?.role ?? state.primaryRole}</strong></span></div>
        <i />
        <div><Icon name="clock" size={28} /><span><small>DURATION</small><strong>{seconds(result?.durationSeconds ?? 0)}</strong></span></div>
        <i />
        <div><Icon name="shield" size={28} /><span><small>RESULT</small><strong>{result?.result ?? 'WIN'}</strong></span></div>
      </div>
      <div className="postgame-actions">
        <button type="button" className="button button--secondary" onClick={() => controller.navigate('HISTORY')}>MATCH HISTORY</button>
        <button type="button" className="button button--primary button--large" onClick={() => void controller.playAgain()} disabled={pending}><Icon name="play" size={18} /> PLAY AGAIN</button>
      </div>
      {state.error && <div className="inline-alert inline-alert--error postgame-error">{state.error}</div>}
      <small className="requeue-note">Play Again keeps {state.primaryRole} / {state.secondaryRole} and requeues immediately.</small>
    </div>
  );
}

export function HistoryScreen({ state }: { state: AppState }) {
  return (
    <div className="screen">
      <PageHeading eyebrow="PROFILE" title="Match history" description="Your recent W3C-LoL community matches." />
      <section className="panel history-panel">
        <header className="history-header"><span>RESULT</span><span>ROLE</span><span>DATE</span><span>SCORE</span><span>DURATION</span></header>
        {state.history.map((match) => (
          <div className="history-row" key={match.id}>
            <span className={`result-pill result-pill--${match.result.toLowerCase()}`}>{match.result}</span>
            <span className="history-role"><RoleGlyph role={match.role} size="small" /> {match.role}</span>
            <span>{new Date(match.playedAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}</span>
            <strong>{match.score}</strong>
            <span>{seconds(match.durationSeconds)}</span>
          </div>
        ))}
      </section>
    </div>
  );
}

function SettingToggle({ title, description, checked, onChange }: { title: string; description: string; checked: boolean; onChange(value: boolean): void }) {
  return (
    <label className="setting-row">
      <span><strong>{title}</strong><small>{description}</small></span>
      <span className="toggle"><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} /><i /></span>
    </label>
  );
}

export function SettingsScreen({ controller }: { controller: AppController }) {
  const { state } = controller;
  return (
    <div className="screen">
      <PageHeading eyebrow="COMPANION" title="Settings" description="Configure notifications, League behavior, and local simulation." />
      <div className="settings-layout">
        <section className="panel settings-panel">
          <header><span className="eyebrow">GENERAL</span><h3>Companion preferences</h3></header>
          <SettingToggle title="1v1 test queue" description="Match as soon as two friends are searching and create a two-player custom lobby." checked={state.settings.duelMode} onChange={(value) => controller.updateSetting('duelMode', value)} />
          <SettingToggle title="Desktop notifications" description="Notify me when a match is found or champion select begins." checked={state.settings.desktopNotifications} onChange={(value) => controller.updateSetting('desktopNotifications', value)} />
          <SettingToggle title="Companion sounds" description="Play subtle audio cues for time-sensitive transitions." checked={state.settings.sounds} onChange={(value) => controller.updateSetting('sounds', value)} />
          <SettingToggle title="Open League when lobby is ready" description="Launch the detected League executable when manual fallback is needed." checked={state.settings.launchLeagueOnLobby} onChange={(value) => controller.updateSetting('launchLeagueOnLobby', value)} />
          <SettingToggle title="Simulation mode" description="Run the entire workflow locally without a backend." checked={state.settings.demoMode} onChange={(value) => controller.updateSetting('demoMode', value)} />
        </section>
        <aside className="panel diagnostics-panel">
          <header><span className="eyebrow">LOCAL ADAPTER</span><h3>League diagnostics</h3></header>
          <div className="diagnostic-state"><span className={`service-orb ${state.league.running ? 'service-orb--online' : ''}`}><Icon name="league" size={27} /></span><div><strong>{state.league.state.replace('_', ' ')}</strong><small>Observed {new Date(state.league.observedAt).getFullYear() > 1970 ? new Date(state.league.observedAt).toLocaleTimeString() : 'not yet'}</small></div></div>
          <p>{state.league.detail}</p>
          <dl>
            <div><dt>Installation</dt><dd>{state.league.installed ? 'DETECTED' : 'UNKNOWN'}</dd></div>
            <div><dt>Process</dt><dd>{state.league.running ? 'RUNNING' : 'NOT RUNNING'}</dd></div>
            <div><dt>Automation</dt><dd>{state.league.automationAvailable ? 'AVAILABLE' : 'UNAVAILABLE'}</dd></div>
            <div><dt>Fallback</dt><dd>AVAILABLE</dd></div>
          </dl>
          <div className="league-path-control">
            <span>
              <strong>INSTALLATION PATH</strong>
              <small title={state.leagueInstallationPath ?? undefined}>
                {state.leagueInstallationPath ?? 'Automatic detection'}
              </small>
            </span>
            <button type="button" onClick={() => void controller.chooseLeagueLocation()}>
              BROWSE
            </button>
          </div>
          <button type="button" className="button button--secondary button--wide" onClick={() => void controller.openLeague()}><Icon name="external" size={16} /> OPEN LEAGUE</button>
          <small className="diagnostic-note"><Icon name="shield" size={14} /> Local operations use the runtime-observed League Client contract.</small>
        </aside>
      </div>
    </div>
  );
}
