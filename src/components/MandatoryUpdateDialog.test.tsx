import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MandatoryUpdateDialog } from './MandatoryUpdateDialog';

function installUpdaterBridge(snapshot: AppUpdateSnapshot) {
  const listeners = new Set<(nextSnapshot: AppUpdateSnapshot) => void>();
  const updater = {
    getStatus: vi.fn().mockResolvedValue(snapshot),
    check: vi.fn().mockResolvedValue(snapshot),
    download: vi.fn().mockResolvedValue({ ...snapshot, status: 'DOWNLOADING', progressPercent: 0 }),
    install: vi.fn().mockResolvedValue(true),
    onStatus: vi.fn((listener: (nextSnapshot: AppUpdateSnapshot) => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    }),
  };
  Object.defineProperty(window, 'w3c', { configurable: true, value: { updater } });
  return {
    updater,
    emit: (nextSnapshot: AppUpdateSnapshot) => listeners.forEach((listener) => listener(nextSnapshot)),
  };
}

describe('mandatory application updates', () => {
  afterEach(() => {
    cleanup();
    Reflect.deleteProperty(window, 'w3c');
  });

  it('blocks the application until the user confirms the download', async () => {
    const available: AppUpdateSnapshot = {
      status: 'AVAILABLE',
      currentVersion: '0.3.24',
      availableVersion: '0.3.25',
      message: 'Pinkward 0.3.25 is available.',
    };
    const { updater } = installUpdaterBridge(available);
    render(<MandatoryUpdateDialog />);

    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent('A new version is required');
    expect(screen.queryByRole('button', { name: /close/i })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /ok.*download update/i }));
    await waitFor(() => expect(updater.download).toHaveBeenCalledOnce());
  });

  it('offers to apply and restart once the update is ready', async () => {
    const ready: AppUpdateSnapshot = {
      status: 'READY',
      currentVersion: '0.3.24',
      availableVersion: '0.3.25',
      progressPercent: 100,
      message: 'Pinkward 0.3.25 is ready to install.',
    };
    const { updater } = installUpdaterBridge(ready);
    render(<MandatoryUpdateDialog />);

    fireEvent.click(await screen.findByRole('button', { name: /apply update and restart/i }));
    await waitFor(() => expect(updater.install).toHaveBeenCalledOnce());
  });
});
