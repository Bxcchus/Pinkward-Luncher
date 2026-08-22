import { useEffect, useState, type FormEvent } from 'react';
import type { AppController } from '../hooks/useAppController';
import { Brand } from '../components/Brand';
import { Icon } from '../components/Icon';
import { Alert, Button } from '../components/UI';
import { WindowControls } from '../components/WindowControls';
import { LeagueMark } from '../components/LeagueMark';

export function LoginScreen({ controller }: { controller: AppController }) {
  const { state } = controller;
  const [gameName, setGameName] = useState('');
  const [tagLine, setTagLine] = useState('');
  const [region, setRegion] = useState('EUW');
  const [submitting, setSubmitting] = useState(false);
  const [detectingIdentity, setDetectingIdentity] = useState(Boolean(window.w3c));
  const [identityDetected, setIdentityDetected] = useState(false);

  useEffect(() => {
    let active = true;
    let requestInFlight = false;
    if (!window.w3c) return undefined;
    const detectIdentity = async () => {
      if (requestInFlight) return;
      requestInFlight = true;
      try {
        const identity = await window.w3c?.league.getIdentity();
        if (!active) return;
        if (!identity) {
          setGameName('');
          setTagLine('');
          setIdentityDetected(false);
          return;
        }
        setGameName(identity.gameName);
        setTagLine(identity.tagLine);
        if (['EUW', 'EUNE', 'NA'].includes(identity.region)) setRegion(identity.region);
        setIdentityDetected(true);
      } catch {
        if (active) setIdentityDetected(false);
      } finally {
        requestInFlight = false;
        if (active) setDetectingIdentity(false);
      }
    };
    void detectIdentity();
    const interval = window.setInterval(() => void detectIdentity(), 2_500);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, []);

  const automaticIdentity = !state.settings.demoMode;
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    await controller.login(gameName, tagLine, region);
    setSubmitting(false);
  };

  return (
    <main className="login-screen">
      <header className="login-topbar"><Brand /><div className="login-topbar__meta"><span>Desktop companion · v0.3.1</span><WindowControls /></div></header>
      <section className="login-context">
        <span className="context-icon"><LeagueMark size={27} /></span>
        <div>
          <span className="eyebrow">LOCAL LEAGUE CONNECTION</span>
          <h1>Connect Pinkward to League</h1>
          <p>Your Riot identity is read from the signed-in League client. It is never entered manually outside simulation mode.</p>
        </div>
        <ul>
          <li><Icon name="check" size={16} /><span><strong>Automatic identity</strong><small>Detected from your active session</small></span></li>
          <li><Icon name="shield" size={16} /><span><strong>Server-authoritative</strong><small>Queue and match decisions stay remote</small></span></li>
          <li><Icon name="users" size={16} /><span><strong>Role-based matches</strong><small>Primary and secondary positions</small></span></li>
        </ul>
      </section>

      <section className="login-panel">
        <form className="login-card" onSubmit={submit}>
          <header>
            <span className="eyebrow">SIGN IN</span>
            <h2>Connect your identity</h2>
            <p>{detectingIdentity
              ? 'Reading the active League session…'
              : identityDetected
                ? 'League is ready. Confirm the server to continue.'
                : automaticIdentity
                  ? 'Open League and sign in to continue.'
                  : 'Choose an identity for the local simulation.'}</p>
          </header>

          <label className="field-label" htmlFor="game-name">Riot ID</label>
          <div className="riot-id-fields">
            <input id="game-name" value={gameName} onChange={(event) => setGameName(event.target.value)} placeholder={automaticIdentity ? 'Waiting for League…' : 'Game name'} autoComplete="nickname" disabled={automaticIdentity} />
            <span>#</span>
            <input aria-label="Tag line" value={tagLine} onChange={(event) => setTagLine(event.target.value)} placeholder="EUW" maxLength={8} disabled={automaticIdentity} />
          </div>
          {identityDetected
            ? <div className="identity-detected"><Icon name="check" size={14} /> Identity detected locally</div>
            : automaticIdentity && !detectingIdentity && (
              <Alert tone="warning" title="League is closed">
                Open League and sign in. Your profile will be detected automatically.
              </Alert>
            )}

          <label className="field-label" htmlFor="region">Region</label>
          <select id="region" value={region} onChange={(event) => setRegion(event.target.value)} disabled={automaticIdentity}>
            <option value="EUW">Europe West (EUW)</option>
            <option value="EUNE">Europe Nordic & East (EUNE)</option>
            <option value="NA">North America (NA)</option>
          </select>

          <label className="field-label" htmlFor="server-address">Server address</label>
          <input id="server-address" className="server-address-input" value={state.serverAddress} onChange={(event) => controller.setServerAddress(event.target.value)} placeholder="play.pinkward.lol" spellCheck={false} />
          <small className="server-address-hint">Public domains use HTTPS automatically. Local IP addresses remain available for tests.</small>

          <div className="league-path-control league-path-control--login">
            <span><strong>League location</strong><small title={state.leagueInstallationPath ?? undefined}>{state.leagueInstallationPath ?? 'Automatic detection'}</small></span>
            <button type="button" onClick={() => void controller.chooseLeagueLocation()}>Browse</button>
          </div>

          {state.error && <Alert>{state.error}</Alert>}

          <Button tone="primary" icon="arrow" fullWidth type="submit" disabled={submitting || (automaticIdentity && !identityDetected)}>
            {submitting ? 'Connecting…' : state.settings.demoMode ? 'Enter demo' : identityDetected ? 'Continue' : 'Waiting for League'}
          </Button>

          <label className="demo-toggle-card">
            <span className="toggle"><input type="checkbox" checked={state.settings.demoMode} onChange={(event) => controller.updateSetting('demoMode', event.target.checked)} /><i /></span>
            <span><strong>Simulation mode</strong><small>Explore the complete flow without a backend</small></span>
            <span className="demo-badge">Demo</span>
          </label>
        </form>
      </section>
    </main>
  );
}
