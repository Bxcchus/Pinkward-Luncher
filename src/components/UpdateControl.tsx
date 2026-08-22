import { useEffect, useState } from 'react';
import { Button } from './UI';

const unavailableSnapshot: AppUpdateSnapshot = {
  status: 'UNAVAILABLE',
  currentVersion: '—',
  message: 'Updates are available in the installed Windows edition.',
};

function buttonLabel(snapshot: AppUpdateSnapshot): string {
  switch (snapshot.status) {
    case 'CHECKING': return 'Checking…';
    case 'DOWNLOADING': return `Downloading ${Math.round(snapshot.progressPercent ?? 0)}%`;
    case 'READY': return 'Restart and install';
    case 'UP_TO_DATE': return 'Check again';
    case 'ERROR': return 'Retry update';
    case 'UNAVAILABLE': return 'Update unavailable';
    default: return 'Check for updates';
  }
}

export function UpdateControl() {
  const [snapshot, setSnapshot] = useState<AppUpdateSnapshot>(unavailableSnapshot);
  const bridge = window.w3c?.updater;

  useEffect(() => {
    if (!bridge) return;
    let active = true;
    const unsubscribe = bridge.onStatus((nextSnapshot) => {
      if (active) setSnapshot(nextSnapshot);
    });
    void bridge.getStatus()
      .then((nextSnapshot) => {
        if (active) setSnapshot(nextSnapshot);
      })
      .catch(() => {
        if (active) setSnapshot({
          ...unavailableSnapshot,
          status: 'ERROR',
          message: 'Unable to read the Pinkward update status.',
        });
      });
    return () => {
      active = false;
      unsubscribe();
    };
  }, [bridge]);

  const busy = snapshot.status === 'CHECKING' || snapshot.status === 'DOWNLOADING';
  const unavailable = snapshot.status === 'UNAVAILABLE';

  const handleUpdate = async () => {
    if (!bridge || busy || unavailable) return;
    if (snapshot.status === 'READY') {
      await bridge.install();
      return;
    }
    try {
      setSnapshot(await bridge.check());
    } catch {
      setSnapshot({
        ...snapshot,
        status: 'ERROR',
        message: 'Unable to retrieve the latest Pinkward release from GitHub.',
      });
    }
  };

  return (
    <div className="update-control" aria-live="polite">
      <div>
        <strong>Application updates</strong>
        <small>{snapshot.message}</small>
        <span>
          Installed {snapshot.currentVersion}
          {snapshot.availableVersion && snapshot.availableVersion !== snapshot.currentVersion
            ? ` · Available ${snapshot.availableVersion}`
            : ''}
        </span>
      </div>
      {snapshot.status === 'DOWNLOADING' && (
        <progress max="100" value={snapshot.progressPercent ?? 0} aria-label="Update download progress" />
      )}
      <Button
        fullWidth
        tone={snapshot.status === 'READY' ? 'primary' : 'secondary'}
        onClick={() => void handleUpdate()}
        disabled={!bridge || busy || unavailable}
      >
        {buttonLabel(snapshot)}
      </Button>
    </div>
  );
}
