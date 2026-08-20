import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import App from './App';

describe('W3C-LoL companion', () => {
  afterEach(() => {
    Reflect.deleteProperty(window, 'w3c');
  });

  it('lets a player opt into simulation and reach the functional home screen', async () => {
    render(<App />);

    expect(screen.getByRole('heading', { name: /connect your identity/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('checkbox', { name: /simulation mode/i }));
    fireEvent.change(screen.getByLabelText(/riot id/i), { target: { value: 'Summoner' } });
    fireEvent.change(screen.getByLabelText(/tag line/i), { target: { value: 'EUW' } });
    fireEvent.click(screen.getByRole('button', { name: /enter demo/i }));

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /welcome back, summoner/i })).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: /find a match/i })).toBeEnabled();
  });

  it('fills and locks the Riot identity from the active League session', async () => {
    Object.defineProperty(window, 'w3c', {
      configurable: true,
      value: {
        platform: 'win32',
        league: {
          getStatus: vi.fn().mockResolvedValue({
            installed: true,
            running: true,
            state: 'CONNECTED',
            adapterHealthy: true,
            automationAvailable: true,
            observedAt: '2026-08-20T00:00:00.000Z',
            detail: 'League Client connected.',
          }),
          getIdentity: vi.fn().mockResolvedValue({
            riotPuuid: 'riot-puuid-1',
            gameName: 'Detected Player',
            tagLine: 'EUW',
            region: 'EUW',
          }),
        },
      },
    });

    render(<App />);

    await waitFor(() => expect(screen.getByLabelText(/riot id/i)).toHaveValue('Detected Player'));
    expect(screen.getByLabelText(/riot id/i)).toBeDisabled();
    expect(screen.getByLabelText(/tag line/i)).toBeDisabled();
    expect(screen.getByLabelText(/region/i)).toBeDisabled();
    expect(screen.getByText(/identity detected locally/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /continue/i })).toBeEnabled();
  });
});
