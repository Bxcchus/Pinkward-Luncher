import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { initialState } from '../domain/appReducer';
import type { AppController } from '../hooks/useAppController';
import { SettingsScreen } from './MainScreens';

afterEach(cleanup);

function settingsController(publicProfile: boolean): AppController {
  return {
    state: {
      ...initialState,
      webPreferences: { publicProfile, showMatchHistory: false },
    },
    chooseLeagueLocation: vi.fn(),
    setServerAddress: vi.fn(),
    updateSetting: vi.fn(),
    updateWebPreference: vi.fn().mockResolvedValue(undefined),
    openLeague: vi.fn(),
  } as unknown as AppController;
}

describe('SettingsScreen leaderboard privacy', () => {
  it('lets the player publish their profile and keeps match history private first', () => {
    const controller = settingsController(false);
    render(<SettingsScreen controller={controller} />);

    const publicProfile = screen.getByRole('checkbox', {
      name: /appear on the public leaderboard/i,
    });
    const matchHistory = screen.getByRole('checkbox', {
      name: /show confirmed match history/i,
    });

    expect(publicProfile).toBeEnabled();
    expect(matchHistory).toBeDisabled();
    fireEvent.click(publicProfile);
    expect(controller.updateWebPreference).toHaveBeenCalledWith('publicProfile', true);
  });

  it('allows confirmed history only after the profile is public', () => {
    const controller = settingsController(true);
    render(<SettingsScreen controller={controller} />);

    const matchHistory = screen.getByRole('checkbox', {
      name: /show confirmed match history/i,
    });
    expect(matchHistory).toBeEnabled();
    fireEvent.click(matchHistory);
    expect(controller.updateWebPreference).toHaveBeenCalledWith('showMatchHistory', true);
  });
});
