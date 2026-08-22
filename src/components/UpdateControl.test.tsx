import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { UpdateControl } from './UpdateControl';

function installUpdaterBridge(snapshot: AppUpdateSnapshot) {
  const listeners = new Set<(nextSnapshot: AppUpdateSnapshot) => void>();
  const updater = {
    getStatus: vi.fn().mockResolvedValue(snapshot),
    check: vi.fn().mockResolvedValue({ ...snapshot, status: 'UP_TO_DATE', message: 'Pinkward is up to date.' }),
    install: vi.fn().mockResolvedValue(true),
    onStatus: vi.fn((listener: (nextSnapshot: AppUpdateSnapshot) => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    }),
  };
  Object.defineProperty(window, 'w3c', {
    configurable: true,
    value: { updater },
  });
  return { updater, emit: (nextSnapshot: AppUpdateSnapshot) => listeners.forEach((listener) => listener(nextSnapshot)) };
}

describe('UpdateControl', () => {
  afterEach(() => {
    cleanup();
    Reflect.deleteProperty(window, 'w3c');
  });

  it('checks GitHub for a newer release', async () => {
    const { updater } = installUpdaterBridge({
      status: 'IDLE',
      currentVersion: '0.3.7',
      message: 'Check GitHub for the latest Pinkward release.',
    });
    render(<UpdateControl />);

    const button = await screen.findByRole('button', { name: /check for updates/i });
    fireEvent.click(button);

    await waitFor(() => expect(updater.check).toHaveBeenCalledOnce());
    expect(await screen.findByText(/pinkward is up to date/i)).toBeInTheDocument();
  });

  it('restarts to install a downloaded update', async () => {
    const { updater } = installUpdaterBridge({
      status: 'READY',
      currentVersion: '0.3.7',
      availableVersion: '0.3.8',
      progressPercent: 100,
      message: 'Pinkward 0.3.8 is ready to install.',
    });
    render(<UpdateControl />);

    fireEvent.click(await screen.findByRole('button', { name: /restart and install/i }));

    await waitFor(() => expect(updater.install).toHaveBeenCalledOnce());
  });
});
