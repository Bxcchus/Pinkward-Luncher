import { describe, expect, it } from 'vitest';
import { appReducer, hydrateInitialState, initialState } from './appReducer';
import { createDemoParticipants } from './demo';

describe('appReducer', () => {
  it('hydrates persisted settings before the first render', () => {
    const hydrated = hydrateInitialState(
      JSON.stringify({ demoMode: true, desktopNotifications: false }),
    );

    expect(hydrated.settings.demoMode).toBe(true);
    expect(hydrated.settings.desktopNotifications).toBe(false);
    expect(hydrated.serverStatus).toBe('SIMULATION');
  });

  it('keeps primary and secondary roles distinct by swapping them', () => {
    const state = { ...initialState, primaryRole: 'MID' as const, secondaryRole: 'JUNGLE' as const };

    const next = appReducer(state, { type: 'SET_PRIMARY_ROLE', role: 'JUNGLE' });

    expect(next.primaryRole).toBe('JUNGLE');
    expect(next.secondaryRole).toBe('MID');
  });

  it('preserves selected roles when Play Again immediately returns to searching', () => {
    const state = {
      ...initialState,
      screen: 'POST_GAME' as const,
      primaryRole: 'ADC' as const,
      secondaryRole: 'SUPPORT' as const,
      currentMatchId: 'finished-match',
    };

    const next = appReducer(state, { type: 'PLAY_AGAIN' });

    expect(next.screen).toBe('SEARCHING');
    expect(next.primaryRole).toBe('ADC');
    expect(next.secondaryRole).toBe('SUPPORT');
    expect(next.currentMatchId).toBeNull();
  });

  it('clears the active lifecycle when leaving so the navigation sidebar returns', () => {
    const state = {
      ...initialState,
      screen: 'MATCH_OVERVIEW' as const,
      lifecycle: 'IN_GAME' as const,
      currentMatchId: 'abandoned-duel',
      duelMatch: true,
      duelOwner: true,
      inGameElapsedSeconds: 106,
    };

    const next = appReducer(state, { type: 'LEAVE_QUEUE' });

    expect(next.screen).toBe('PLAY');
    expect(next.lifecycle).toBeNull();
    expect(next.currentMatchId).toBeNull();
    expect(next.duelMatch).toBe(false);
    expect(next.inGameElapsedSeconds).toBe(0);
  });

  it('tracks each joined player without changing server-assigned teams', () => {
    const participants = createDemoParticipants('me', 'Tester', 'EUW', 'MID');
    const matchState = appReducer(
      { ...initialState, player: { id: 'me', gameName: 'Tester', tagLine: 'EUW', region: 'EUW' } },
      { type: 'READY_COMPLETE', matchId: 'match-1', participants },
    );
    const joining = appReducer(matchState, {
      type: 'JOINING_STARTED',
      lobby: { name: 'W3C-ABC123', password: 'SECURE12' },
    });
    const joined = participants.reduce(
      (current, participant) => appReducer(current, { type: 'PLAYER_JOINED', playerId: participant.id }),
      joining,
    );

    expect(joined.joinedCount).toBe(10);
    expect(joined.participants.filter((participant) => participant.team === 'BLUE')).toHaveLength(5);
    expect(joined.participants.filter((participant) => participant.team === 'RED')).toHaveLength(5);
  });

  it('keeps manual lobby creation targeted and requires explicit confirmation', () => {
    const required = appReducer(initialState, {
      type: 'MANUAL_CREATE_REQUIRED',
      commandId: 'command-manual',
      matchId: 'match-manual',
      lobby: { name: 'W3C-MANUAL', password: 'SAFE1234' },
    });

    expect(required.screen).toBe('CREATING_MATCH');
    expect(required.manualCreate).toEqual({
      commandId: 'command-manual',
      matchId: 'match-manual',
      confirmed: false,
    });
    expect(required.lobby?.name).toBe('W3C-MANUAL');

    const confirmed = appReducer(required, { type: 'MANUAL_CREATE_CONFIRMED' });
    expect(confirmed.manualCreate?.confirmed).toBe(true);
  });
});
