import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { AppController } from '../hooks/useAppController';
import { ROLES, type AppState, type ChatChannel, type MatchLifecycle, type MatchSummary, type PlayerStats } from '../domain/types';
import { Icon } from '../components/Icon';
import { MatchTeams } from '../components/MatchTeams';
import { RoleGlyph, RoleLoadout } from '../components/RoleSelector';
import { Alert, Button, Dialog, EmptyState } from '../components/UI';
import { LeagueMark } from '../components/LeagueMark';
import { PartyDialog } from '../components/PartyDialog';
import { SummonerAvatar } from '../components/SummonerAvatar';
import { UpdateControl } from '../components/UpdateControl';
import { isWebDemo } from '../services/runtimeConfig';

const seconds = (value: number): string =>
  `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`;

function statsFromHistory(matches: MatchSummary[]): PlayerStats {
  const wins = matches.filter((match) => match.result === 'WIN').length;
  const losses = matches.filter((match) => match.result === 'LOSS').length;
  const knownDurations = matches.filter((match) => match.durationSeconds > 0);
  const roles = ROLES.map((role) => {
    const roleMatches = matches.filter((match) => match.role === role);
    const roleWins = roleMatches.filter((match) => match.result === 'WIN').length;
    const roleLosses = roleMatches.filter((match) => match.result === 'LOSS').length;
    return {
      role,
      gamesPlayed: roleMatches.length,
      wins: roleWins,
      losses: roleLosses,
      winRate: roleWins + roleLosses === 0 ? 0 : Math.round((roleWins / (roleWins + roleLosses)) * 10_000) / 100,
    };
  }).filter((role) => role.gamesPlayed > 0).sort((left, right) => right.gamesPlayed - left.gamesPlayed);
  let currentWinStreak = 0;
  for (const match of matches) {
    if (match.result !== 'WIN') break;
    currentWinStreak += 1;
  }
  return {
    gamesPlayed: matches.length,
    wins,
    losses,
    unresolved: matches.length - wins - losses,
    winRate: wins + losses === 0 ? 0 : Math.round((wins / (wins + losses)) * 10_000) / 100,
    averageDurationSeconds: knownDurations.length === 0
      ? 0
      : Math.round(knownDurations.reduce((total, match) => total + match.durationSeconds, 0) / knownDurations.length),
    currentWinStreak,
    favoriteRole: roles[0]?.role ?? null,
    roles,
    matches,
  };
}

function PageHeading({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: React.ReactNode }) {
  return (
    <header className="page-heading">
      <div><span className="eyebrow">{eyebrow}</span><h1>{title}</h1><p>{description}</p></div>
      {action}
    </header>
  );
}

function SectionHeader({ title, detail, action }: { title: string; detail?: string; action?: React.ReactNode }) {
  return <header className="section-header"><div><h2>{title}</h2>{detail && <p>{detail}</p>}</div>{action}</header>;
}

export function HomeScreen({ controller }: { controller: AppController }) {
  const { state } = controller;
  const leagueReady = isWebDemo || (state.league.running && state.league.adapterHealthy);
  return (
    <div className="screen screen--home">
      <PageHeading
        eyebrow="OVERVIEW"
        title={`Welcome back, ${state.player?.gameName}`}
        description="League, server and matchmaking status at a glance."
        action={<Button tone="primary" icon="search" onClick={() => controller.navigate('PLAY')}>Start matchmaking</Button>}
      />

      <section className="identity-summary panel">
        <div className="identity-summary__player">
          <SummonerAvatar
            gameName={state.player?.gameName}
            profileIconDataUrl={state.player?.profileIconDataUrl}
            size="large"
          />
          <div><span className="eyebrow">RIOT ID</span><h2>{state.player?.gameName}<small>#{state.player?.tagLine}</small></h2><p>{state.player?.region} · {isWebDemo ? 'Fictitious demo profile' : 'Detected automatically'}</p></div>
        </div>
        <div className="identity-summary__status">
          <div><span className={`status-icon status-icon--${leagueReady ? 'success' : 'warning'}`}><LeagueMark size={20} /></span><span><small>League</small><strong>{isWebDemo ? 'simulated' : state.league.state.replaceAll('_', ' ').toLowerCase()}</strong></span></div>
          <div><span className={`status-icon status-icon--${state.serverStatus === 'DISCONNECTED' ? 'danger' : 'success'}`}><Icon name="server" size={20} /></span><span><small>Server</small><strong>{state.serverStatus.toLowerCase()}</strong></span></div>
          <div><span className="status-icon"><RoleGlyph role={state.primaryRole} size="small" /></span><span><small>Preferred roles</small><strong>{state.primaryRole} · {state.secondaryRole}</strong></span></div>
        </div>
      </section>

      {!state.league.running && !state.settings.demoMode && (
        <Alert tone="warning" title="League is not running">
          Open League and sign in. Pinkward will detect your profile automatically.
          <button type="button" onClick={() => void controller.openLeague()}>Open League</button>
        </Alert>
      )}

      <div className="home-grid">
        <section className="panel quick-match">
          <SectionHeader title="Matchmaking" detail="Your saved role selection is ready." />
          <div className="role-pair">
            <div><RoleGlyph role={state.primaryRole} size="large" /><span><small>Primary</small><strong>{state.primaryRole}</strong></span></div>
            <Icon name="arrow" size={16} />
            <div><RoleGlyph role={state.secondaryRole} size="large" /><span><small>Secondary</small><strong>{state.secondaryRole}</strong></span></div>
          </div>
          <dl className="compact-metrics">
            <div><dt>Players searching</dt><dd>{state.playersSearching}</dd></div>
            <div><dt>Estimated wait</dt><dd>~{seconds(state.estimatedWaitSeconds)}</dd></div>
            <div><dt>Mode</dt><dd>{state.settings.duelMode ? '1v1 Showdown' : 'Community 5v5'}</dd></div>
          </dl>
          <Button tone="primary" icon="search" fullWidth onClick={() => controller.navigate('PLAY')}>Find a match</Button>
        </section>

        <section className="panel recent-panel">
          <SectionHeader title="Recent matches" detail="Your last three completed games." action={<button type="button" className="text-button" onClick={() => controller.navigate('HISTORY')}>View history <Icon name="arrow" size={14} /></button>} />
          {state.history.length === 0 ? (
            <EmptyState title="No matches yet" description="Completed matches will appear here." />
          ) : state.history.slice(0, 3).map((match) => (
            <div className="recent-match" key={match.id}>
              <span className={`result-pill result-pill--${match.result.toLowerCase()}`}>{match.result}</span>
              <RoleGlyph role={match.role} size="small" />
              <div><strong>{match.role}</strong><small>{new Date(match.playedAt).toLocaleDateString()}</small></div>
              <strong>{match.score}</strong>
              <span>{seconds(match.durationSeconds)}</span>
            </div>
          ))}
        </section>
      </div>
    </div>
  );
}

function QueueSummary({ controller, searching = false, pending = false, onFind }: { controller: AppController; searching?: boolean; pending?: boolean; onFind?: () => void }) {
  const { state } = controller;
  const leagueReady = isWebDemo || (state.league.running && state.league.automationAvailable && state.league.adapterHealthy);
  const unavailable = state.serverStatus === 'DISCONNECTED' && !state.settings.demoMode;
  const waitingForLeader = Boolean(state.partyId && state.partyLeaderId !== state.player?.id);
  return (
    <aside className={`panel queue-summary${searching ? ' queue-summary--searching' : ''}`}>
      <SectionHeader title={searching ? 'Queue active' : 'Queue summary'} />
      <div className="queue-summary__roles">
        <div><span className="queue-role-label">Primary</span><strong>{state.primaryRole}</strong><RoleGlyph role={state.primaryRole} size="large" /></div>
        <div><span className="queue-role-label">Secondary</span><strong>{state.secondaryRole}</strong><RoleGlyph role={state.secondaryRole} size="large" /></div>
      </div>
      {searching && (
        <div className="queue-summary__timer" aria-live="polite">
          <span><i className="pulse-mini" /> Search elapsed</span>
          <strong>{seconds(state.queueElapsedSeconds)}</strong>
          <small>{state.settings.duelMode ? `${state.playersSearching} of 2 players present` : `${state.playersSearching} players searching`}</small>
        </div>
      )}
      <dl className="compact-metrics">
        <div><dt><Icon name="spark" size={18} /><span>Mode</span></dt><dd>{state.settings.duelMode ? '1v1 Showdown' : 'Community 5v5'}</dd></div>
        <div><dt><Icon name="clock" size={18} /><span>Estimated wait</span></dt><dd>{state.settings.duelMode ? '~ 0:45' : `~${seconds(state.estimatedWaitSeconds)}`}</dd></div>
        <div><dt><Icon name="server" size={18} /><span>Server</span></dt><dd className={state.serverStatus === 'DISCONNECTED' ? 'text-danger' : 'text-success'}>{state.serverStatus}</dd></div>
        <div><dt><LeagueMark size={18} /><span>League</span></dt><dd className={leagueReady ? 'text-success' : state.league.running ? 'text-warning' : 'text-danger'}>{isWebDemo ? 'Simulated' : leagueReady ? 'Detected' : state.league.running ? 'Manual fallback' : 'Unavailable'}</dd></div>
      </dl>
      {state.error && <Alert>{state.error}</Alert>}
      {searching ? (
        <Button tone="destructive" className="queue-action queue-action--cancel" fullWidth onClick={() => void controller.leaveQueue()}>Cancel search</Button>
      ) : (
        <Button tone="primary" className="queue-action" fullWidth onClick={onFind ?? (() => void controller.findMatch())} disabled={pending || unavailable || waitingForLeader}>{pending ? 'Connecting…' : waitingForLeader ? 'Waiting for party leader' : 'Find match'}</Button>
      )}
      <p className="security-note"><Icon name="shield" size={14} /> Teams and match transitions remain server-controlled.</p>
    </aside>
  );
}

function MatchmakingStage({ controller, searching = false, pending = false, onFind, overlay }: { controller: AppController; searching?: boolean; pending?: boolean; onFind?: () => void; overlay?: React.ReactNode }) {
  const { state } = controller;
  const [partyOpen, setPartyOpen] = useState(false);
  const partySize = 1 + state.partyMembers.length;
  const rolesLocked = searching;
  return (
    <div className={`screen matchmaking-stage${searching ? ' matchmaking-stage--searching' : ''}`}>
      <PageHeading
        eyebrow="MATCHMAKING"
        title={searching ? 'Search in progress' : state.settings.duelMode ? '1v1 Showdown' : 'Choose your roles'}
        description={searching
          ? 'Your configuration is locked while the server finds a match.'
          : state.settings.duelMode
            ? 'Role selection is disabled in 1v1. Both players enter the same Showdown ruleset.'
            : 'Select a primary and secondary position.'}
        action={<div className="matchmaking-actions">
          {searching && <span className="search-live"><i className="pulse-mini" /> Queue live</span>}
          <button type="button" className="party-trigger" onClick={() => setPartyOpen(true)} aria-label={`Open party, ${partySize} of 5 players`}>
            <Icon name="users" size={17} /><span>Party</span><strong>{partySize}/5</strong>
          </button>
        </div>}
      />
      <div className="play-layout">
        <section className="match-mode-selector" aria-label="Matchmaking mode">
          <button
            type="button"
            className={`match-mode-option${state.settings.duelMode ? ' match-mode-option--active' : ''}`}
            aria-label="1v1 Showdown — Howling Abyss"
            aria-pressed={state.settings.duelMode}
            disabled={searching || state.partyMembers.length > 0}
            onClick={() => controller.setMatchmakingMode('DUEL_1V1')}
          >
            <span className="match-mode-option__players">1V1</span>
            <span><strong>Showdown</strong><small>First blood · 100 CS · First turret</small></span>
          </button>
          <button
            type="button"
            className={`match-mode-option${!state.settings.duelMode ? ' match-mode-option--active' : ''}`}
            aria-label="5v5 Community Draft — Summoner's Rift"
            aria-pressed={!state.settings.duelMode}
            disabled={searching}
            onClick={() => controller.setMatchmakingMode('COMMUNITY_5V5')}
          >
            <span className="match-mode-option__players">5V5</span>
            <span><strong>Community Draft</strong><small>Summoner's Rift · Tournament draft</small></span>
          </button>
        </section>
        {!state.settings.duelMode && (
          <section className={`panel role-panel${rolesLocked ? ' role-panel--locked' : ''}`} aria-label="Role loadout" aria-disabled={rolesLocked}>
            <RoleLoadout primaryRole={state.primaryRole} secondaryRole={state.secondaryRole} disabled={rolesLocked} onPrimaryChange={controller.setPrimaryRole} onSecondaryChange={controller.setSecondaryRole} />
          </section>
        )}
        <QueueSummary controller={controller} searching={searching} pending={pending} onFind={onFind} />
      </div>
      {partyOpen && <PartyDialog controller={controller} locked={searching} onClose={() => setPartyOpen(false)} />}
      {overlay}
    </div>
  );
}

export function PlayScreen({ controller }: { controller: AppController }) {
  const [pending, setPending] = useState(false);
  const findMatch = async () => {
    setPending(true);
    await controller.findMatch();
    setPending(false);
  };
  return <MatchmakingStage controller={controller} pending={pending} onFind={() => void findMatch()} />;
}

export function SearchingScreen({ controller }: { controller: AppController }) {
  return <MatchmakingStage controller={controller} searching />;
}

export function ReadyCheckScreen({ controller }: { controller: AppController }) {
  const { state } = controller;
  const totalPlayers = state.settings.duelMode && !state.localBotMatch ? 2 : 10;
  const visibleAccepted = Math.min(totalPlayers, state.acceptedCount);
  const overlay = (
    <div className="match-found-overlay">
      <section className="match-found-panel" role="dialog" aria-modal="true" aria-labelledby="match-found-title" aria-describedby="match-found-description">
        <i className="match-found-panel__edge" aria-hidden="true" />
        <header>
          <span className="eyebrow">MATCH FOUND</span>
          <h1 id="match-found-title">{state.acceptedByMe ? 'Response locked' : 'Your roster is ready'}</h1>
          <p id="match-found-description">{state.acceptedByMe ? 'Waiting for the remaining players.' : 'Confirm before the deployment window closes.'}</p>
        </header>
        {state.error && <Alert>{state.error}</Alert>}
        <div className="match-found-countdown"><span>Respond within</span><strong>{state.readySecondsLeft}</strong><small>seconds</small></div>
        <div className="ready-progress"><div><i style={{ width: `${(visibleAccepted / totalPlayers) * 100}%` }} /></div><span>{visibleAccepted} of {totalPlayers} players confirmed</span></div>
        <footer>
          {state.acceptedByMe ? (
            <div className="accepted-confirmation"><Icon name="check" size={17} /> Accepted — response transmitted</div>
          ) : (
            <><Button tone="ghost" className="match-decline" onClick={() => void controller.declineReadyCheck()}>Decline</Button><Button tone="success" icon="check" className="match-accept" onClick={() => void controller.acceptReadyCheck()}>Accept</Button></>
          )}
        </footer>
      </section>
    </div>
  );
  return (
    <MatchmakingStage controller={controller} searching overlay={overlay} />
  );
}

const creationSteps = ['Teams assigned', 'Secure lobby prepared', 'League connection checked'];

export function CreatingMatchScreen({ controller }: { controller: AppController }) {
  const { state } = controller;
  if (state.manualCreate && state.lobby) {
    return (
      <div className="screen screen--centered">
        <Dialog eyebrow="MANUAL ACTION REQUIRED" title="Create the custom game" description="Local automation is unavailable. Follow these exact steps in League.">
          {state.error && <Alert>{state.error}</Alert>}
          <ol className="instruction-list">
            <li><i>1</i><span><strong>Open League</strong><small>Go to Play → Custom Game → Create.</small></span></li>
            <li><i>2</i><span><strong>Use the assigned credentials</strong><small>Do not change the name or password.</small></span></li>
            <li><i>3</i><span><strong>Confirm here</strong><small>The server will validate the created lobby.</small></span></li>
          </ol>
          <div className="credentials-grid">
            <div className="credential"><span>Lobby name</span><strong>{state.lobby.name}</strong><button type="button" onClick={() => void controller.copyText(state.lobby!.name, 'Lobby name')} aria-label="Copy lobby name"><Icon name="copy" size={17} /></button></div>
            <div className="credential"><span>Password</span><strong>{state.lobby.password}</strong><button type="button" onClick={() => void controller.copyText(state.lobby!.password, 'Password')} aria-label="Copy password"><Icon name="copy" size={17} /></button></div>
          </div>
          <div className="inline-actions"><Button icon="external" onClick={() => void controller.openLeague()}>Open League</Button><Button tone="success" icon="check" onClick={controller.confirmManualLobbyCreated} disabled={state.manualCreate.confirmed}>{state.manualCreate.confirmed ? 'Confirmation sent' : 'I created the lobby'}</Button></div>
        </Dialog>
      </div>
    );
  }
  return (
    <div className="screen screen--centered">
      <section className="flow-panel panel compact-flow">
        <header className="flow-panel__header"><span className="search-indicator"><span className="spinner-mini" /></span><div><span className="eyebrow">LOBBY SETUP</span><h1>Creating your match</h1><p>The companion is coordinating the private game.</p></div></header>
        {state.error && <Alert>{state.error}</Alert>}
        <div className="creation-steps">{creationSteps.map((step, index) => <div key={step} className={index < state.creationStep ? 'creation-step creation-step--done' : index === state.creationStep ? 'creation-step creation-step--active' : 'creation-step'}><i>{index < state.creationStep ? <Icon name="check" size={15} /> : index + 1}</i><span>{step}</span><small>{index < state.creationStep ? 'Complete' : index === state.creationStep ? 'In progress' : 'Pending'}</small></div>)}</div>
      </section>
    </div>
  );
}

export function JoiningLobbyScreen({ controller }: { controller: AppController }) {
  const { state } = controller;
  const total = state.participants.length || (state.settings.duelMode ? 2 : 10);
  return (
    <div className="screen">
      <PageHeading eyebrow="LOBBY" title="Players are joining" description="Assigned teams and roles are shown exactly as provided by the server." />
      <section className="join-summary panel"><div><strong>{state.joinedCount}</strong><span>of {total} connected</span></div><div className="progress-track"><i style={{ width: `${(state.joinedCount / total) * 100}%` }} /></div><span>{state.joinedCount === total ? 'Roster complete' : 'Waiting for League companions…'}</span></section>
      {state.error && <Alert>{state.error}</Alert>}
      <div className="lobby-layout">
        <MatchTeams participants={state.participants} />
        <aside className="panel fallback-card">
          <SectionHeader title="Manual connection" detail="Use only if League did not join automatically." />
          <div className="credential"><span>Lobby name</span><strong>{state.lobby?.name ?? 'Preparing…'}</strong><button type="button" onClick={() => state.lobby && void controller.copyText(state.lobby.name, 'Lobby name')} aria-label="Copy lobby name"><Icon name="copy" size={17} /></button></div>
          <div className="credential"><span>Password</span><strong>{state.lobby?.password ?? '••••••••'}</strong><button type="button" onClick={() => state.lobby && void controller.copyText(state.lobby.password, 'Password')} aria-label="Copy password"><Icon name="copy" size={17} /></button></div>
          <Button icon="external" fullWidth onClick={() => void controller.openLeague()}>Open League</Button>
          <p className="security-note"><Icon name="shield" size={14} /> Teams and launch remain server-controlled.</p>
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
  PLAYERS_JOINING: { title: 'Players joining', detail: 'Waiting for all companions' },
  LOBBY_FULL: { title: 'Roster complete', detail: 'All expected players connected' },
  LOBBY_VALIDATING: { title: 'Validating teams', detail: 'Checking roster and side assignments' },
  LOBBY_VALID: { title: 'Lobby validated', detail: 'Roster matches the server plan' },
  STARTING: { title: 'Starting game', detail: 'All conditions are satisfied' },
  CHAMP_SELECT: { title: 'Champion select', detail: 'Continue in League Client' },
  IN_GAME: { title: 'Game in progress', detail: 'Result detection is active' },
  DUEL_ENDING: { title: 'Result saved', detail: 'Waiting for Riot to close the custom game' },
  POST_GAME: { title: 'Post game', detail: 'Collecting match result' },
  FINISHED: { title: 'Finished', detail: 'Result recorded' },
};

export function MatchOverviewScreen({ controller }: { controller: AppController }) {
  const { state } = controller;
  const lifecycle = state.lifecycle ?? 'LOBBY_VALIDATING';
  if (lifecycle === 'DUEL_ENDING') {
    return (
      <div className="screen">
        <PageHeading eyebrow="DUEL COMPLETE" title="Result saved" description="The raw result is durable. Statistics are calculated afterward while League closes the custom game." action={<Button tone="ghost" icon="external" onClick={() => void controller.openLeague()}>Open League</Button>} />
        <section className="panel ingame-dashboard">
          <div className="game-clock"><span className="pulse-mini" /><small>Automatic exit</small><strong>RESULT SAFE</strong><span>Closing both game windows</span></div>
          <Alert tone="info" title="The result is already stored">
            Five seconds after the winning condition, Pinkward sends Alt+F4 twice to each League game window so the confirmation dialog is handled on both computers.
          </Alert>
        </section>
      </div>
    );
  }
  if (lifecycle === 'IN_GAME') {
    const current = state.participants.find((participant) => participant.isCurrentPlayer);
    return (
      <div className="screen">
        <PageHeading eyebrow="LIVE MATCH" title="Game in progress" description="Pinkward is monitoring League and will detect the result automatically." action={<Button tone="ghost" icon="external" onClick={() => void controller.openLeague()}>Open League</Button>} />
        <section className="panel ingame-dashboard">
          <div className="game-clock"><span className="pulse-mini" /><small>Elapsed time</small><strong>{seconds(state.inGameElapsedSeconds)}</strong><span>Tracking active</span></div>
          <dl className="game-facts">
            <div><dt>Your role</dt><dd><RoleGlyph role={current?.role ?? state.primaryRole} size="small" /> {current?.role ?? state.primaryRole}</dd></div>
            <div><dt>Your team</dt><dd>{current?.team ?? 'Assigned'}</dd></div>
            <div><dt>League connection</dt><dd className={state.league.running ? 'text-success' : 'text-warning'}>{state.league.running ? state.league.state.replaceAll('_', ' ') : 'Connection lost'}</dd></div>
            <div><dt>Match ID</dt><dd>{state.currentMatchId?.slice(-12) ?? 'Local match'}</dd></div>
          </dl>
          <Alert tone="info" title="Automatic result detection">
            You can keep this panel open or return to League. The result will be recorded when the game ends.
          </Alert>
          {state.settings.demoMode && <div className="recovery-action"><span>Simulation does not expose League gameflow.</span><Button tone="ghost" onClick={controller.finishDemoGame}>The game has ended</Button></div>}
        </section>
      </div>
    );
  }

  const completed = ['LOBBY_VALID', 'STARTING', 'CHAMP_SELECT'].includes(lifecycle);
  return (
    <div className="screen match-screen">
      <PageHeading eyebrow={`MATCH ${state.currentMatchId?.slice(-8).toUpperCase() ?? ''}`} title={lifecycleCopy[lifecycle].title} description={lifecycleCopy[lifecycle].detail} />
      {state.error && <Alert>{state.error}</Alert>}
      <section className="panel lifecycle-banner">
        <span className="search-indicator"><span className="spinner-mini" /></span>
        <div><span className="eyebrow">CONNECTION STATUS</span><h2>{lifecycleCopy[lifecycle].title}</h2><p>{lifecycleCopy[lifecycle].detail}</p></div>
        <div className="lifecycle-checks"><span><Icon name="check" size={14} /> Players connected</span><span className={completed ? '' : 'pending'}><Icon name="check" size={14} /> Teams validated</span><span className={['STARTING', 'CHAMP_SELECT'].includes(lifecycle) ? '' : 'pending'}><Icon name="check" size={14} /> Ready to launch</span></div>
      </section>
      <MatchTeams participants={state.participants} />
      <p className="security-note centered"><Icon name="shield" size={14} /> Roster and launch remain controlled by Pinkward.</p>
    </div>
  );
}

export function PostGameScreen({ controller }: { controller: AppController }) {
  const { state } = controller;
  const result = state.lastResult;
  const pending = result === null;
  return (
    <div className="screen">
      <PageHeading eyebrow="MATCH COMPLETE" title={pending ? 'Result pending' : result.result === 'WIN' ? 'Victory recorded' : 'Defeat recorded'} description={pending ? 'The server is resolving the authoritative outcome.' : 'The result has been saved to your history.'} />
      <section className={`panel result-summary result-summary--${pending ? 'pending' : result.result.toLowerCase()}`}>
        <div className="result-summary__outcome"><span>{pending ? 'Pending' : result.result}</span><strong>{result?.score ?? '—'}</strong><small>Final score</small></div>
        <dl>
          <div><dt>Role played</dt><dd><RoleGlyph role={result?.role ?? state.primaryRole} size="small" /> {result?.role ?? state.primaryRole}</dd></div>
          <div><dt>Duration</dt><dd>{seconds(result?.durationSeconds ?? 0)}</dd></div>
          <div><dt>Match</dt><dd>{result?.id.slice(-12) ?? state.currentMatchId?.slice(-12) ?? 'Resolving'}</dd></div>
        </dl>
        <div className="result-summary__actions"><Button onClick={() => controller.navigate('HISTORY')}>History</Button><Button tone="primary" icon="play" onClick={() => void controller.playAgain()} disabled={pending}>Play again</Button></div>
      </section>
      {state.error && <Alert>{state.error}</Alert>}
      {state.participants.length > 0 && <section className="postgame-teams"><SectionHeader title="Teams" detail="Final match roster" /><MatchTeams participants={state.participants} /></section>}
    </div>
  );
}

export function HistoryScreen({ state }: { state: AppState }) {
  const stats = state.stats ?? statsFromHistory(state.history);
  return (
    <div className="screen">
      <PageHeading eyebrow="PROFILE" title="Performance" description="Career statistics across your Pinkward matches." />
      <section className="stats-overview" aria-label="Career statistics">
        <div className="panel stat-card"><span>Matches</span><strong>{stats.gamesPlayed}</strong><small>completed games</small></div>
        <div className="panel stat-card stat-card--win"><span>Wins</span><strong>{stats.wins}</strong><small>{stats.currentWinStreak > 0 ? `${stats.currentWinStreak} current streak` : 'no active streak'}</small></div>
        <div className="panel stat-card stat-card--loss"><span>Losses</span><strong>{stats.losses}</strong><small>{stats.unresolved > 0 ? `${stats.unresolved} unresolved` : 'decisive results'}</small></div>
        <div className="panel stat-card stat-card--rate"><span>Win rate</span><strong>{stats.winRate.toFixed(stats.winRate % 1 === 0 ? 0 : 1)}%</strong><small>{stats.favoriteRole ? `most played · ${stats.favoriteRole}` : 'play to establish'}</small></div>
      </section>

      <div className="stats-detail-grid">
        <section className="panel role-stats-panel">
          <SectionHeader title="Roles" detail="Performance by assigned position." />
          {stats.roles.length === 0 ? <EmptyState title="No role data" description="Your assigned roles will be summarized here." /> : <>
            <header className="role-stats-header"><span>Role</span><span>Played</span><span>W / L</span><span>Win rate</span></header>
            {stats.roles.map((role) => <div className="role-stats-row" key={role.role}>
              <span><RoleGlyph role={role.role} size="small" /><strong>{role.role}</strong></span>
              <span>{role.gamesPlayed}</span>
              <span>{role.wins} / {role.losses}</span>
              <strong>{role.winRate.toFixed(role.winRate % 1 === 0 ? 0 : 1)}%</strong>
            </div>)}
          </>}
          <footer><span>Average match</span><strong>{seconds(stats.averageDurationSeconds)}</strong></footer>
        </section>

        <section className="panel history-panel">
          <SectionHeader title="Match history" detail="Latest 50 completed matches." />
          {state.history.length === 0 ? <EmptyState title="No match history" description="Your completed games will appear here." /> : <>
            <header className="history-header"><span>Result</span><span>Role</span><span>Date</span><span>Score</span><span>Duration</span></header>
            {state.history.map((match) => <div className="history-row" key={match.id}><span className={`result-pill result-pill--${match.result.toLowerCase()}`}>{match.result === 'UNKNOWN' ? 'N/A' : match.result}</span><span className="history-role"><RoleGlyph role={match.role} size="small" /> {match.role}</span><span>{new Date(match.playedAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}</span><strong>{match.score}</strong><span>{seconds(match.durationSeconds)}</span></div>)}
          </>}
        </section>
      </div>
    </div>
  );
}

export function ChatScreen({ controller }: { controller: AppController }) {
  const { state } = controller;
  const [channel, setChannel] = useState<ChatChannel>('GENERAL');
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const available = state.settings.demoMode || state.serverStatus === 'CONNECTED';
  const rooms: Record<ChatChannel, { slug: string; title: string; detail: string }> = {
    GENERAL: { slug: 'general', title: 'General', detail: 'Talk with the whole Pinkward community.' },
    DUEL_1V1: { slug: '1v1', title: '1V1 Showdown', detail: 'Find an opponent or discuss duel rules.' },
    COMMUNITY_5V5: { slug: '5v5', title: 'Community 5V5', detail: 'Build a team and organize community drafts.' },
  };
  const room = rooms[channel];
  const messages = state.chatMessages.filter((message) =>
    (message.channel ?? 'GENERAL') === channel,
  );

  useEffect(() => {
    endRef.current?.scrollIntoView?.({ block: 'end' });
  }, [channel, messages.length]);

  const submit = async (event?: FormEvent) => {
    event?.preventDefault();
    const content = draft.trim();
    if (!content || content.length > 500 || sending || !available) return;
    setSending(true);
    const sent = await controller.sendChatMessage(content, channel);
    if (sent) setDraft('');
    setSending(false);
  };

  return (
    <div className="screen chat-screen">
      <PageHeading eyebrow="COMMUNITY" title={`# ${room.slug}`} description="Choose the room that matches the game mode you want to play." />
      <div className="chat-layout">
        <section className="panel chat-panel">
          <header className="chat-channel-header">
            <div><span className="chat-channel-icon"><Icon name="chat" size={18} /></span><span><strong>{room.title}</strong><small>{room.detail}</small></span></div>
            <span className={`chat-live-state${available ? ' chat-live-state--online' : ''}`}><i />{available ? 'Live' : 'Offline'}</span>
          </header>
          <div className="chat-messages" role="log" aria-live="polite" aria-label={`${room.title} messages`}>
            {messages.length === 0 ? (
              <EmptyState title={`Start the ${room.slug} conversation`} description="The last 100 messages from this room will appear here." />
            ) : messages.map((message) => {
              const own = message.authorId === state.player?.id;
              return <article className={`chat-message${own ? ' chat-message--own' : ''}`} key={message.id}>
                <span className="chat-avatar">{message.gameName.trim().charAt(0).toUpperCase()}</span>
                <div>
                  <header><strong>{message.gameName}<small>#{message.tagLine}</small></strong><time dateTime={message.sentAt}>{new Date(message.sentAt).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}</time>{own && <em>You</em>}</header>
                  <p>{message.content}</p>
                </div>
              </article>;
            })}
            <div ref={endRef} />
          </div>
          <form className="chat-composer" onSubmit={(event) => void submit(event)}>
            <textarea
              aria-label={`Message #${room.slug}`}
              placeholder={available ? `Message #${room.slug}` : 'Reconnect to the server to send messages'}
              value={draft}
              maxLength={500}
              rows={2}
              disabled={!available || sending}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  void submit();
                }
              }}
            />
            <footer><span>{draft.length}/500 · Shift + Enter for a new line</span><Button type="submit" tone="primary" icon="arrow" disabled={!draft.trim() || sending || !available}>{sending ? 'Sending…' : 'Send'}</Button></footer>
          </form>
        </section>

        <aside className="panel chat-sidebar">
          <SectionHeader title="Game rooms" detail="Messages stay inside the selected mode." />
          <nav className="chat-room-switcher" aria-label="Community rooms">
            <button type="button" className={channel === 'GENERAL' ? 'is-active' : ''} aria-pressed={channel === 'GENERAL'} onClick={() => { setChannel('GENERAL'); setDraft(''); }}><strong># GENERAL</strong><small>Community</small></button>
            <button type="button" className={channel === 'DUEL_1V1' ? 'is-active' : ''} aria-pressed={channel === 'DUEL_1V1'} onClick={() => { setChannel('DUEL_1V1'); setDraft(''); }}><strong># 1V1</strong><small>Showdown</small></button>
            <button type="button" className={channel === 'COMMUNITY_5V5' ? 'is-active' : ''} aria-pressed={channel === 'COMMUNITY_5V5'} onClick={() => { setChannel('COMMUNITY_5V5'); setDraft(''); }}><strong># 5V5</strong><small>Community draft</small></button>
          </nav>
          <div className="chat-identity"><SummonerAvatar gameName={state.player?.gameName} profileIconDataUrl={state.player?.profileIconDataUrl} /><span><small>Posting as</small><strong>{state.player?.gameName}<em>#{state.player?.tagLine}</em></strong></span></div>
          <div className="chat-guidelines">
            <span className="eyebrow">ROOM RULES</span>
            <p>Keep matchmaking, availability and team discussion here.</p>
            <p>No harassment, spam or private information.</p>
            <p>Your verified Riot ID is shown with every message.</p>
          </div>
          <dl className="chat-limits"><div><dt>History</dt><dd>100 messages</dd></div><div><dt>Message limit</dt><dd>500 characters</dd></div><div><dt>Cooldown</dt><dd>2 seconds</dd></div></dl>
        </aside>
      </div>
    </div>
  );
}

function SettingToggle({ title, description, checked, onChange }: { title: string; description: string; checked: boolean; onChange(value: boolean): void }) {
  return <label className="setting-row"><span><strong>{title}</strong><small>{description}</small></span><span className="toggle"><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} /><i /></span></label>;
}

export function SettingsScreen({ controller }: { controller: AppController }) {
  const { state } = controller;
  return (
    <div className="screen">
      <PageHeading eyebrow="COMPANION" title="Settings" description={isWebDemo ? 'Review the isolated browser simulation settings.' : 'Configure League, the server and desktop behavior.'} />
      {state.error && <Alert>{state.error}</Alert>}
      <div className="settings-layout">
        <div className="settings-main">
          {isWebDemo ? (
            <section className="panel settings-section">
              <SectionHeader title="Web demo isolation" detail="Reviewer-safe local simulation." />
              <div className="demo-isolation-note"><Icon name="shield" size={19} /><span><strong>No external connection</strong><small>The demo does not call Riot, the League Client or the Pinkward production API.</small></span></div>
            </section>
          ) : (
            <section className="panel settings-section">
              <SectionHeader title="Connection" detail="League installation and matchmaking server." />
              <label className="input-row"><span><strong>League installation</strong><small>{state.leagueInstallationPath ?? 'Automatic detection'}</small></span><Button onClick={() => void controller.chooseLeagueLocation()}>Select folder</Button></label>
              <label className="input-stack" htmlFor="settings-server"><span><strong>Server address</strong><small>Domain or HTTP(S) address of the Pinkward backend.</small></span><input id="settings-server" value={state.serverAddress} onChange={(event) => controller.setServerAddress(event.target.value)} spellCheck={false} /></label>
            </section>
          )}
          <section className="panel settings-section">
            <SectionHeader title="Preferences" detail="Notification and launch behavior." />
            {!isWebDemo && <SettingToggle title="Desktop notifications" description="Notify me when a match is found or champion select begins." checked={state.settings.desktopNotifications} onChange={(value) => controller.updateSetting('desktopNotifications', value)} />}
            <SettingToggle title="Companion sounds" description="Play subtle cues for time-sensitive transitions." checked={state.settings.sounds} onChange={(value) => controller.updateSetting('sounds', value)} />
            {!isWebDemo && <SettingToggle title="Open League when lobby is ready" description="Launch League when a manual connection is required." checked={state.settings.launchLeagueOnLobby} onChange={(value) => controller.updateSetting('launchLeagueOnLobby', value)} />}
          </section>
          <section className="panel settings-section">
            <SectionHeader title="Developer tools" detail="Local workflow validation." />
            {isWebDemo
              ? <div className="demo-isolation-note"><Icon name="check" size={19} /><span><strong>Simulation mode locked on</strong><small>Production matchmaking cannot be enabled from this build.</small></span></div>
              : <SettingToggle title="Simulation mode" description="Run the full workflow locally without a backend." checked={state.settings.demoMode} onChange={(value) => controller.updateSetting('demoMode', value)} />}
          </section>
        </div>
        <aside className="panel about-panel">
          <SectionHeader title="Pinkward Companion" detail={isWebDemo ? 'Browser demo edition' : 'Windows desktop edition'} />
          {isWebDemo ? (
            <>
              <div className="diagnostic-state"><span className="status-icon status-icon--success"><LeagueMark size={20} /></span><div><strong>SIMULATED</strong><small>No Riot connection is attempted.</small></div></div>
              <a className="button button--ghost button--full" href="https://pinkward.lol/download">Download Windows app</a>
            </>
          ) : (
            <>
              <div className="diagnostic-state"><span className={`status-icon status-icon--${state.league.running ? 'success' : 'warning'}`}><LeagueMark size={20} /></span><div><strong>{state.league.state.replaceAll('_', ' ')}</strong><small>{state.league.detail}</small></div></div>
              <Button icon="external" fullWidth onClick={() => void controller.openLeague()}>Open League</Button>
              <UpdateControl />
              <details className="advanced-details">
                <summary>Advanced technical status</summary>
                <dl><div><dt>Installation</dt><dd>{state.league.installed ? 'Detected' : 'Unknown'}</dd></div><div><dt>Process</dt><dd>{state.league.running ? 'Running' : 'Not running'}</dd></div><div><dt>Automation</dt><dd>{state.league.automationAvailable ? 'Available' : 'Unavailable'}</dd></div><div><dt>Adapter</dt><dd>{state.league.adapterHealthy ? 'Healthy' : 'Unavailable'}</dd></div><div><dt>Observed</dt><dd>{new Date(state.league.observedAt).getFullYear() > 1970 ? new Date(state.league.observedAt).toLocaleTimeString() : 'Not yet'}</dd></div></dl>
              </details>
            </>
          )}
        </aside>
      </div>
    </div>
  );
}
