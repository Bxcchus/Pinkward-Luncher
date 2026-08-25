import { useEffect, useState } from 'react';
import { Button } from './UI';

const initialSnapshot: AppUpdateSnapshot = {
  status: 'UNAVAILABLE',
  currentVersion: '—',
  message: 'Updates are available in the installed Windows edition.',
};

function requiresUpdate(snapshot: AppUpdateSnapshot): boolean {
  return snapshot.status === 'AVAILABLE' ||
    snapshot.status === 'DOWNLOADING' ||
    snapshot.status === 'READY';
}

export function MandatoryUpdateDialog() {
  const bridge = window.w3c?.updater;
  const [snapshot, setSnapshot] = useState<AppUpdateSnapshot>(initialSnapshot);
  const [requiredVersion, setRequiredVersion] = useState<string | null>(null);

  useEffect(() => {
    if (!bridge) return;
    let active = true;
    const applySnapshot = (nextSnapshot: AppUpdateSnapshot) => {
      if (!active) return;
      setSnapshot(nextSnapshot);
      if (requiresUpdate(nextSnapshot) && nextSnapshot.availableVersion) {
        setRequiredVersion(nextSnapshot.availableVersion);
      }
    };
    const unsubscribe = bridge.onStatus(applySnapshot);
    void bridge.getStatus().then(applySnapshot).catch(() => undefined);
    return () => {
      active = false;
      unsubscribe();
    };
  }, [bridge]);

  if (!bridge || !requiredVersion) return null;

  const downloading = snapshot.status === 'DOWNLOADING';
  const ready = snapshot.status === 'READY';
  const failed = snapshot.status === 'ERROR';
  const progress = Math.max(0, Math.min(100, snapshot.progressPercent ?? 0));

  const continueUpdate = async () => {
    if (downloading) return;
    if (ready) {
      await bridge.install();
      return;
    }
    try {
      setSnapshot(await bridge.download());
    } catch {
      setSnapshot((current) => ({
        ...current,
        status: 'ERROR',
        message: 'The Pinkward update could not be downloaded. Please retry.',
      }));
    }
  };

  return (
    <div className="mandatory-update-overlay">
      <section
        className="mandatory-update-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="mandatory-update-title"
        aria-describedby="mandatory-update-description"
      >
        <span className="eyebrow">Pinkward update</span>
        <h1 id="mandatory-update-title">
          {ready ? 'Update ready to apply' : failed ? 'Update interrupted' : 'A new version is required'}
        </h1>
        <p id="mandatory-update-description">
          {ready
            ? `Pinkward ${requiredVersion} has been downloaded. Apply it now to restart on the latest version.`
            : failed
              ? snapshot.message
              : `Pinkward ${requiredVersion} is available. Confirm to download the update before continuing.`}
        </p>

        <div className="mandatory-update-version">
          <span>Installed <strong>{snapshot.currentVersion}</strong></span>
          <i aria-hidden="true">→</i>
          <span>Available <strong>{requiredVersion}</strong></span>
        </div>

        {downloading && (
          <div className="mandatory-update-progress" aria-live="polite">
            <div><span>Downloading update</span><strong>{Math.round(progress)}%</strong></div>
            <progress max="100" value={progress} aria-label="Update download progress" />
          </div>
        )}

        <Button
          tone="primary"
          fullWidth
          disabled={downloading}
          onClick={() => void continueUpdate()}
        >
          {ready ? 'Apply update and restart' : failed ? 'Retry update' : downloading ? 'Downloading…' : 'OK — Download update'}
        </Button>
        <small className="mandatory-update-note">
          This window stays open until the update is downloaded and ready to apply.
        </small>
      </section>
    </div>
  );
}
