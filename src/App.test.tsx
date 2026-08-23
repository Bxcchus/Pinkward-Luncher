import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import App from './App';

describe('Pinkward companion', () => {
  afterEach(() => {
    cleanup();
    localStorage.clear();
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

  it('builds a five-player party and switches to Community 5v5', async () => {
    render(<App />);

    fireEvent.click(screen.getByRole('checkbox', { name: /simulation mode/i }));
    fireEvent.change(screen.getByLabelText(/riot id/i), { target: { value: 'Party Leader' } });
    fireEvent.change(screen.getByLabelText(/tag line/i), { target: { value: 'EUW' } });
    fireEvent.click(screen.getByRole('button', { name: /enter demo/i }));

    await waitFor(() => screen.getByRole('button', { name: /start matchmaking/i }));
    fireEvent.click(screen.getByRole('button', { name: /start matchmaking/i }));
    fireEvent.click(await screen.findByRole('button', { name: /open party, 1 of 5 players/i }));

    const field = screen.getByRole('textbox', { name: /invite by riot id/i });
    for (const riotId of ['Top#EUW', 'Jungle#EUW', 'Mid#EUW', 'Bot#EUW']) {
      fireEvent.change(field, { target: { value: riotId } });
      fireEvent.click(screen.getByRole('button', { name: /^invite$/i }));
    }

    expect(screen.getByRole('button', { name: /open party, 5 of 5 players/i })).toBeInTheDocument();
    expect(field).toBeDisabled();
    expect(screen.getByText(/your party is full/i)).toBeInTheDocument();
    expect(screen.getByText('Community 5v5')).toBeInTheDocument();
  });

  it('offers 1v1 Showdown as a permanent matchmaking mode', async () => {
    render(<App />);

    fireEvent.click(screen.getByRole('checkbox', { name: /simulation mode/i }));
    fireEvent.change(screen.getByLabelText(/riot id/i), { target: { value: 'Duelist' } });
    fireEvent.change(screen.getByLabelText(/tag line/i), { target: { value: 'EUW' } });
    fireEvent.click(screen.getByRole('button', { name: /enter demo/i }));

    await waitFor(() => screen.getByRole('button', { name: /start matchmaking/i }));
    fireEvent.click(screen.getByRole('button', { name: /start matchmaking/i }));

    const duel = screen.getByRole('button', { name: /1v1 showdown/i });
    const fiveVersusFive = screen.getByRole('button', { name: /5v5 community draft/i });
    expect(duel).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText(/roles locked for 1v1/i)).toBeInTheDocument();
    screen.getAllByRole('radio').forEach((role) => expect(role).toBeDisabled());

    fireEvent.click(fiveVersusFive);
    expect(fiveVersusFive).toHaveAttribute('aria-pressed', 'true');
    expect(duel).toHaveAttribute('aria-pressed', 'false');
    expect(screen.queryByText(/roles locked for 1v1/i)).not.toBeInTheDocument();
    screen.getAllByRole('radio').forEach((role) => expect(role).toBeEnabled());

    fireEvent.click(duel);
    expect(duel).toHaveAttribute('aria-pressed', 'true');
    screen.getAllByRole('radio').forEach((role) => expect(role).toBeDisabled());
  });

  it('keeps the 1v1 and 5v5 community rooms separate in simulation mode', async () => {
    render(<App />);

    fireEvent.click(screen.getByRole('checkbox', { name: /simulation mode/i }));
    fireEvent.change(screen.getByLabelText(/riot id/i), { target: { value: 'Chat Player' } });
    fireEvent.change(screen.getByLabelText(/tag line/i), { target: { value: 'EUW' } });
    fireEvent.click(screen.getByRole('button', { name: /enter demo/i }));

    await waitFor(() => screen.getByRole('button', { name: /community/i }));
    fireEvent.click(screen.getByRole('button', { name: /community/i }));
    fireEvent.change(screen.getByLabelText(/message #1v1/i), {
      target: { value: 'Looking for a 1v1 opponent.' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^send$/i }));

    expect(await screen.findByText('Looking for a 1v1 opponent.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /# 5v5/i }));
    expect(screen.queryByText('Looking for a 1v1 opponent.')).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/message #5v5/i), {
      target: { value: 'Support available for a 5v5.' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^send$/i }));
    expect(await screen.findByText('Support available for a 5v5.')).toBeInTheDocument();
    expect(screen.getAllByText(/Chat Player/).length).toBeGreaterThan(0);
  });
});
