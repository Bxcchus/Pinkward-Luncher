import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { initialState } from '../domain/appReducer';
import type { AppController } from '../hooks/useAppController';
import { AppShell } from './AppShell';

describe('AppShell League availability', () => {
  it('keeps a visible warning after League closes for a connected player', () => {
    const openLeague = vi.fn().mockResolvedValue(undefined);
    const state = {
      ...initialState,
      screen: 'HOME' as const,
      player: { id: 'player-1', gameName: 'Player', tagLine: 'EUW', region: 'EUW' },
      league: {
        ...initialState.league,
        installed: true,
        running: false,
        state: 'NOT_RUNNING' as const,
        detail: 'League Client is not running.',
      },
    };
    const controller = {
      state,
      navigate: vi.fn(),
      logout: vi.fn(),
      openLeague,
    } as unknown as AppController;

    render(<AppShell state={state} controller={controller}><div>Home</div></AppShell>);

    expect(screen.getByRole('alert')).toHaveTextContent(/League Client is closed/i);
    fireEvent.click(screen.getByRole('button', { name: /open league/i }));
    expect(openLeague).toHaveBeenCalledOnce();
  });

  it('keeps the tag line and region separate from a long summoner name', () => {
    const state = {
      ...initialState,
      screen: 'HOME' as const,
      player: {
        id: 'player-long-name',
        gameName: 'SAMURAI SHAMPLOO WITH A VERY LONG NAME',
        tagLine: 'jin02',
        region: 'EUW',
      },
    };
    const controller = {
      state,
      navigate: vi.fn(),
      logout: vi.fn(),
      openLeague: vi.fn(),
    } as unknown as AppController;

    const { container } = render(
      <AppShell state={state} controller={controller}><div>Home</div></AppShell>,
    );

    expect(container.querySelector('.topbar__game-name')).toHaveTextContent(state.player.gameName);
    expect(container.querySelector('.topbar__tag-line')).toHaveTextContent('#jin02');
    expect(container.querySelector('.region-badge')).toHaveTextContent('EUW');
  });
});
