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

  it('persists the selected permanent matchmaking mode', () => {
    const community = appReducer(initialState, {
      type: 'SET_SETTING',
      key: 'duelMode',
      value: false,
    });
    const hydrated = hydrateInitialState(JSON.stringify(community.settings));

    expect(hydrated.settings.duelMode).toBe(false);
  });

  it('keeps primary and secondary roles distinct by swapping them', () => {
    const state = { ...initialState, primaryRole: 'MID' as const, secondaryRole: 'JUNGLE' as const };

    const next = appReducer(state, { type: 'SET_PRIMARY_ROLE', role: 'JUNGLE' });

    expect(next.primaryRole).toBe('JUNGLE');
    expect(next.secondaryRole).toBe('MID');
  });

  it('also swaps when the primary role is selected as secondary', () => {
    const state = { ...initialState, primaryRole: 'TOP' as const, secondaryRole: 'SUPPORT' as const };

    const next = appReducer(state, { type: 'SET_SECONDARY_ROLE', role: 'TOP' });

    expect(next.primaryRole).toBe('SUPPORT');
    expect(next.secondaryRole).toBe('TOP');
  });

  it('keeps parties unique and limited to five players including the leader', () => {
    const invited = ['one', 'two', 'three', 'four', 'five'].reduce(
      (state, name) => appReducer(state, {
        type: 'ADD_PARTY_MEMBER',
        member: { id: `${name}#euw`, gameName: name, tagLine: 'EUW', status: 'INVITED' },
      }),
      initialState,
    );

    expect(invited.partyMembers).toHaveLength(4);

    const duplicate = appReducer(invited, {
      type: 'ADD_PARTY_MEMBER',
      member: { id: 'one#euw', gameName: 'one', tagLine: 'EUW', status: 'INVITED' },
    });
    expect(duplicate.partyMembers).toHaveLength(4);

    const removed = appReducer(duplicate, { type: 'REMOVE_PARTY_MEMBER', memberId: 'two#euw' });
    expect(removed.partyMembers.map((member) => member.id)).toEqual(['one#euw', 'three#euw', 'four#euw']);
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

  it('counts unread community messages and clears the badge when chat opens', () => {
    const message = {
      id: 'chat-1',
      authorId: 'player-2',
      gameName: 'Teammate',
      tagLine: 'EUW',
      content: 'Looking for a support player',
      sentAt: '2026-08-22T12:00:00Z',
    };

    const received = appReducer({ ...initialState, screen: 'HOME' }, {
      type: 'RECEIVE_CHAT_MESSAGE',
      message,
    });
    expect(received.unreadChatMessages).toBe(1);
    expect(received.chatMessages).toEqual([message]);

    const opened = appReducer(received, { type: 'NAVIGATE', screen: 'CHAT' });
    expect(opened.unreadChatMessages).toBe(0);
  });

  it('adds a pushed party invitation once so the player can join it', () => {
    const invitation = {
      id: 'invite-1',
      partyId: 'party-1',
      leaderId: 'leader-1',
      gameName: 'Party Leader',
      tagLine: 'EUW',
      createdAt: '2026-08-22T12:00:00Z',
    };

    const received = appReducer(initialState, {
      type: 'RECEIVE_PARTY_INVITATION',
      invitation,
    });
    const duplicate = appReducer(received, {
      type: 'RECEIVE_PARTY_INVITATION',
      invitation,
    });

    expect(received.partyInvitations).toEqual([invitation]);
    expect(duplicate.partyInvitations).toEqual([invitation]);
  });
});
