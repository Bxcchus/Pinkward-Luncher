import { useEffect, useState, type FormEvent } from 'react';
import type { AppController } from '../hooks/useAppController';
import { Brand } from '../components/Brand';
import { Icon } from '../components/Icon';

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
    if (!window.w3c) {
      return undefined;
    }
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
      <div className="login-screen__atmosphere" aria-hidden="true">
        <div className="rift-ring rift-ring--one" />
        <div className="rift-ring rift-ring--two" />
        <div className="rift-sigil">W</div>
      </div>
      <section className="login-intro">
        <Brand />
        <div className="login-intro__copy">
          <span className="eyebrow eyebrow--gold">COMMUNITY MATCHMAKING</span>
          <h1>Competitive games.<br /><em>Better teammates.</em></h1>
          <p>
            Queue by role, confirm your match, and let the companion coordinate the rest.
            No Discord. No lobby management.
          </p>
        </div>
        <div className="feature-row">
          <div><Icon name="shield" /><span><strong>Role balanced</strong><small>Every match</small></span></div>
          <div><Icon name="users" /><span><strong>Community queue</strong><small>Built for EUW</small></span></div>
          <div><Icon name="spark" /><span><strong>Seamless flow</strong><small>Queue to game</small></span></div>
        </div>
        <small className="login-version">W3C-LoL Companion · Alpha 0.2</small>
      </section>

      <section className="login-panel">
        <form className="login-card" onSubmit={submit}>
          <header>
            <span className="eyebrow">WELCOME BACK</span>
            <h2>Connect your identity</h2>
            <p>{detectingIdentity
              ? 'Reading the active League session…'
              : identityDetected
                ? 'Riot ID detected from your active League session.'
                : automaticIdentity
                  ? 'League is closed or no signed-in player was detected.'
                  : 'Choose an identity for the local simulation.'}</p>
          </header>
          <label className="field-label" htmlFor="game-name">RIOT ID</label>
          <div className="riot-id-fields">
            <input
              id="game-name"
              value={gameName}
              onChange={(event) => setGameName(event.target.value)}
              placeholder={automaticIdentity ? 'Waiting for League…' : 'Game name'}
              autoComplete="nickname"
              disabled={automaticIdentity}
            />
            <span>#</span>
            <input
              aria-label="Tag line"
              value={tagLine}
              onChange={(event) => setTagLine(event.target.value)}
              placeholder="EUW"
              maxLength={8}
              disabled={automaticIdentity}
            />
          </div>
          {identityDetected
            ? <div className="identity-detected"><Icon name="check" size={14} /> Identity detected locally</div>
            : automaticIdentity && !detectingIdentity && (
              <div className="identity-detected identity-detected--unavailable">
                <Icon name="league" size={14} /> Open League and sign in to continue
              </div>
            )}
          <label className="field-label" htmlFor="region">REGION</label>
          <select
            id="region"
            value={region}
            onChange={(event) => setRegion(event.target.value)}
            disabled={automaticIdentity}
          >
            <option value="EUW">Europe West (EUW)</option>
            <option value="EUNE">Europe Nordic & East (EUNE)</option>
            <option value="NA">North America (NA)</option>
          </select>

          <div className="league-path-control league-path-control--login">
            <span>
              <strong>LEAGUE LOCATION</strong>
              <small title={state.leagueInstallationPath ?? undefined}>
                {state.leagueInstallationPath ?? 'Automatic detection'}
              </small>
            </span>
            <button type="button" onClick={() => void controller.chooseLeagueLocation()}>
              BROWSE
            </button>
          </div>

          <label className="field-label" htmlFor="server-address">SERVER ADDRESS</label>
          <input
            id="server-address"
            className="server-address-input"
            value={state.serverAddress}
            onChange={(event) => controller.setServerAddress(event.target.value)}
            placeholder="http://192.168.1.12:8080"
            spellCheck={false}
          />
          <small className="server-address-hint">Friends enter the host PC address, never localhost.</small>

          {state.error && <div className="form-error" role="alert">{state.error}</div>}

          <button
            type="submit"
            className="button button--primary button--wide"
            disabled={submitting || (automaticIdentity && !identityDetected)}
          >
            <span>{submitting
              ? 'CONNECTING…'
              : state.settings.demoMode
                ? 'ENTER DEMO'
                : identityDetected
                  ? 'CONTINUE'
                  : 'WAITING FOR LEAGUE'}</span>
            {!submitting && <Icon name="arrow" size={18} />}
          </button>

          <label className="demo-toggle-card">
            <span className="toggle">
              <input
                type="checkbox"
                checked={state.settings.demoMode}
                onChange={(event) => controller.updateSetting('demoMode', event.target.checked)}
              />
              <i />
            </span>
            <span>
              <strong>Simulation mode</strong>
              <small>Explore the complete flow without a backend</small>
            </span>
            <span className="demo-badge">DEMO</span>
          </label>

          <footer>
            The desktop is an untrusted companion. Match decisions always remain server-authoritative.
          </footer>
        </form>
      </section>
    </main>
  );
}
