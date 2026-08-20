import type { AppAction, AppState, MatchParticipant, Role } from './types';
import { defaultServerAddress } from '../services/runtimeConfig';

const defaultLeagueStatus = {
  installed: false,
  running: false,
  state: 'UNKNOWN' as const,
  adapterHealthy: false,
  automationAvailable: false,
  observedAt: new Date(0).toISOString(),
  detail: 'League status has not been observed yet.',
};

const demoFromEnvironment = import.meta.env.VITE_DEMO_MODE === 'true';

export const initialState: AppState = {
  screen: 'LOGIN',
  player: null,
  primaryRole: 'MID',
  secondaryRole: 'JUNGLE',
  serverStatus: demoFromEnvironment ? 'SIMULATION' : 'CONNECTING',
  league: defaultLeagueStatus,
  leagueInstallationPath: null,
  serverAddress: defaultServerAddress,
  playersSearching: 37,
  estimatedWaitSeconds: 74,
  queueElapsedSeconds: 0,
  readyCheckId: null,
  readySecondsLeft: Number(import.meta.env.VITE_READY_CHECK_SECONDS ?? 20),
  acceptedCount: 0,
  acceptedByMe: false,
  creationStep: 0,
  lobby: null,
  manualCreate: null,
  participants: [],
  joinedCount: 0,
  lifecycle: null,
  currentMatchId: null,
  localBotMatch: false,
  duelMatch: false,
  duelOwner: false,
  inGameElapsedSeconds: 0,
  lastResult: null,
  history: [
    {
      id: 'match-demo-previous-1',
      playedAt: new Date(Date.now() - 86_400_000).toISOString(),
      result: 'WIN',
      role: 'MID',
      durationSeconds: 1_842,
      score: '31 – 24',
    },
    {
      id: 'match-demo-previous-2',
      playedAt: new Date(Date.now() - 172_800_000).toISOString(),
      result: 'LOSS',
      role: 'JUNGLE',
      durationSeconds: 2_116,
      score: '18 – 29',
    },
  ],
  settings: {
    duelMode: true,
    demoMode: demoFromEnvironment,
    desktopNotifications: true,
    sounds: true,
    launchLeagueOnLobby: false,
  },
  toast: null,
  error: null,
};

export function hydrateInitialState(serializedSettings: string | null): AppState {
  if (!serializedSettings) return initialState;
  try {
    const parsed = JSON.parse(serializedSettings) as Partial<AppState['settings']>;
    const settings = { ...initialState.settings };
    (Object.keys(settings) as Array<keyof AppState['settings']>).forEach((key) => {
      if (typeof parsed[key] === 'boolean') settings[key] = parsed[key];
    });
    return {
      ...initialState,
      settings,
      serverStatus: settings.demoMode ? 'SIMULATION' : 'CONNECTING',
    };
  } catch {
    return initialState;
  }
}

const activeScreens = new Set([
  'SEARCHING',
  'READY_CHECK',
  'CREATING_MATCH',
  'JOINING_LOBBY',
  'MATCH_OVERVIEW',
]);

function swapDistinctRoles(
  state: AppState,
  selectedRole: Role,
  field: 'primaryRole' | 'secondaryRole',
): Pick<AppState, 'primaryRole' | 'secondaryRole'> {
  if (field === 'primaryRole') {
    return {
      primaryRole: selectedRole,
      secondaryRole: selectedRole === state.secondaryRole ? state.primaryRole : state.secondaryRole,
    };
  }
  return {
    primaryRole: selectedRole === state.primaryRole ? state.secondaryRole : state.primaryRole,
    secondaryRole: selectedRole,
  };
}

function updateJoined(participants: MatchParticipant[], playerId: string): MatchParticipant[] {
  return participants.map((participant) =>
    participant.id === playerId ? { ...participant, joined: true } : participant,
  );
}

export function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'LOGIN_SUCCESS':
      return { ...state, player: action.player, screen: 'HOME', error: null };
    case 'LOGOUT':
      return {
        ...initialState,
        settings: state.settings,
        serverAddress: state.serverAddress,
        leagueInstallationPath: state.leagueInstallationPath,
      };
    case 'NAVIGATE':
      if (activeScreens.has(state.screen)) return state;
      return { ...state, screen: action.screen, error: null };
    case 'SET_PRIMARY_ROLE':
      return { ...state, ...swapDistinctRoles(state, action.role, 'primaryRole') };
    case 'SET_SECONDARY_ROLE':
      return { ...state, ...swapDistinctRoles(state, action.role, 'secondaryRole') };
    case 'SET_SERVER_STATUS':
      return { ...state, serverStatus: action.status };
    case 'SET_LEAGUE_STATUS':
      return { ...state, league: action.status };
    case 'SET_LEAGUE_INSTALLATION_PATH':
      return { ...state, leagueInstallationPath: action.path };
    case 'SET_SERVER_ADDRESS':
      return { ...state, serverAddress: action.address };
    case 'FIND_MATCH':
      return {
        ...state,
        screen: 'SEARCHING',
        playersSearching: state.settings.duelMode ? 1 : state.playersSearching,
        estimatedWaitSeconds: state.settings.duelMode ? 0 : state.estimatedWaitSeconds,
        queueElapsedSeconds: 0,
        readyCheckId: null,
        acceptedCount: 0,
        acceptedByMe: false,
        creationStep: 0,
        lobby: null,
        manualCreate: null,
        participants: [],
        joinedCount: 0,
        lifecycle: null,
        currentMatchId: null,
        localBotMatch: false,
        duelMatch: false,
        duelOwner: false,
        inGameElapsedSeconds: 0,
        error: null,
      };
    case 'LOCAL_BOT_MATCH_FOUND':
      return {
        ...state,
        screen: 'READY_CHECK',
        readyCheckId: action.readyCheckId,
        readySecondsLeft: Number(import.meta.env.VITE_READY_CHECK_SECONDS ?? 20),
        acceptedCount: 9,
        acceptedByMe: false,
        localBotMatch: true,
        error: null,
      };
    case 'QUEUE_TICK':
      return {
        ...state,
        queueElapsedSeconds: state.queueElapsedSeconds + 1,
        playersSearching: action.playersSearching ?? state.playersSearching,
      };
    case 'LEAVE_QUEUE':
      return {
        ...state,
        screen: 'PLAY',
        queueElapsedSeconds: 0,
        readyCheckId: null,
        acceptedCount: 0,
        acceptedByMe: false,
        creationStep: 0,
        lobby: null,
        manualCreate: null,
        participants: [],
        joinedCount: 0,
        lifecycle: null,
        currentMatchId: null,
        localBotMatch: false,
        duelMatch: false,
        duelOwner: false,
        inGameElapsedSeconds: 0,
      };
    case 'MATCH_FOUND':
      return {
        ...state,
        screen: 'READY_CHECK',
        readyCheckId: action.readyCheckId,
        readySecondsLeft: Number(import.meta.env.VITE_READY_CHECK_SECONDS ?? 20),
        acceptedCount: 0,
        acceptedByMe: false,
      };
    case 'ACCEPT_READY_CHECK':
      return state.acceptedByMe
        ? state
        : { ...state, acceptedByMe: true, acceptedCount: Math.max(1, state.acceptedCount) };
    case 'READY_TICK':
      return { ...state, readySecondsLeft: Math.max(0, state.readySecondsLeft - 1) };
    case 'READY_PROGRESS':
      return { ...state, acceptedCount: Math.min(10, Math.max(state.acceptedCount, action.acceptedCount)) };
    case 'READY_COMPLETE':
      return {
        ...state,
        screen: 'CREATING_MATCH',
        currentMatchId: action.matchId,
        participants: action.participants,
        lifecycle: 'MATCH_READY',
        creationStep: 0,
      };
    case 'DUEL_MATCHED':
      return {
        ...state,
        screen: 'CREATING_MATCH',
        currentMatchId: action.matchId,
        participants: action.participants,
        lifecycle: 'MATCH_READY',
        creationStep: 0,
        localBotMatch: false,
        duelMatch: true,
        duelOwner: action.owner,
      };
    case 'CREATION_STEP':
      return { ...state, creationStep: action.step };
    case 'MANUAL_CREATE_REQUIRED':
      return {
        ...state,
        screen: 'CREATING_MATCH',
        currentMatchId: action.matchId,
        lifecycle: 'LOBBY_CREATING',
        lobby: action.lobby,
        manualCreate: {
          commandId: action.commandId,
          matchId: action.matchId,
          confirmed: false,
        },
      };
    case 'MANUAL_CREATE_CONFIRMED':
      return state.manualCreate
        ? { ...state, manualCreate: { ...state.manualCreate, confirmed: true } }
        : state;
    case 'JOINING_STARTED':
      return {
        ...state,
        screen: 'JOINING_LOBBY',
        lobby: action.lobby,
        manualCreate: null,
        lifecycle: 'PLAYERS_JOINING',
        joinedCount: state.participants.filter((participant) => participant.joined).length,
      };
    case 'PLAYER_JOINED': {
      const participants = updateJoined(state.participants, action.playerId);
      return {
        ...state,
        participants,
        joinedCount: participants.filter((participant) => participant.joined).length,
      };
    }
    case 'SET_LIFECYCLE':
      return {
        ...state,
        lifecycle: action.lifecycle,
        screen:
          action.lifecycle === 'POST_GAME' || action.lifecycle === 'FINISHED'
            ? 'POST_GAME'
            : action.lifecycle === 'LOBBY_FULL' ||
                action.lifecycle === 'LOBBY_VALIDATING' ||
                action.lifecycle === 'LOBBY_VALID' ||
                action.lifecycle === 'STARTING' ||
                action.lifecycle === 'CHAMP_SELECT' ||
                action.lifecycle === 'IN_GAME'
              ? 'MATCH_OVERVIEW'
              : state.screen,
      };
    case 'GAME_TICK':
      return { ...state, inGameElapsedSeconds: state.inGameElapsedSeconds + 1 };
    case 'GAME_ENDED':
      return {
        ...state,
        screen: 'POST_GAME',
        lifecycle: 'FINISHED',
        lastResult: action.result,
        history: [action.result, ...state.history.filter((item) => item.id !== action.result.id)],
      };
    case 'PLAY_AGAIN':
      return {
        ...state,
        screen: 'SEARCHING',
        queueElapsedSeconds: 0,
        acceptedCount: 0,
        acceptedByMe: false,
        creationStep: 0,
        lobby: null,
        manualCreate: null,
        participants: [],
        joinedCount: 0,
        lifecycle: null,
        currentMatchId: null,
        localBotMatch: false,
        duelMatch: false,
        duelOwner: false,
        inGameElapsedSeconds: 0,
        lastResult: null,
        error: null,
      };
    case 'SET_SETTING': {
      const settings = { ...state.settings, [action.key]: action.value };
      return {
        ...state,
        settings,
        serverStatus:
          action.key === 'demoMode' && action.value
            ? 'SIMULATION'
            : action.key === 'demoMode'
              ? 'CONNECTING'
              : state.serverStatus,
      };
    }
    case 'SHOW_TOAST':
      return { ...state, toast: action.message };
    case 'CLEAR_TOAST':
      return { ...state, toast: null };
    case 'SET_ERROR':
      return { ...state, error: action.message };
    default:
      return state;
  }
}
