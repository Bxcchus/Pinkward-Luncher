import { useCallback, useEffect, useMemo, useReducer, useRef } from 'react';
import { appReducer, hydrateInitialState, initialState } from '../domain/appReducer';
import { createDemoLobby, createDemoParticipants, createLocalBotParticipants } from '../domain/demo';
import { shouldCloseInactiveGameflow } from '../domain/gameflowExit';
import type {
  AppSettings,
  AppState,
  DuelSnapshot,
  LeagueStatus,
  MatchSummary,
  PlayerIdentity,
  Role,
} from '../domain/types';
import { ApiError, W3cApiClient } from '../services/apiClient';
import { handleLeagueCommand, toLobbyCredentials } from '../services/leagueCommandHandler';
import { configureServerAddress, runtimeConfig } from '../services/runtimeConfig';
import {
  lifecycleForServerEvent,
  TypedWebSocketClient,
  type ClientEvent,
  type ServerEvent,
} from '../services/webSocketClient';

const browserLeagueFallback: LeagueStatus = {
  installed: false,
  running: false,
  state: 'UNKNOWN',
  adapterHealthy: false,
  automationAvailable: false,
  observedAt: new Date().toISOString(),
  detail: 'League detection is available in the Electron companion.',
};

function desktopNotification(title: string, body: string, enabled: boolean): void {
  if (!enabled || !('Notification' in window)) return;
  if (Notification.permission === 'granted') {
    new Notification(title, { body });
  } else if (Notification.permission === 'default') {
    void Notification.requestPermission().then((permission) => {
      if (permission === 'granted') new Notification(title, { body });
    });
  }
}

export interface AppController {
  state: AppState;
  login(gameName: string, tagLine: string, region: string, accessCode?: string): Promise<void>;
  logout(): void;
  navigate(screen: 'HOME' | 'PLAY' | 'HISTORY' | 'SETTINGS'): void;
  setPrimaryRole(role: Role): void;
  setSecondaryRole(role: Role): void;
  findMatch(): Promise<void>;
  leaveQueue(): Promise<void>;
  acceptReadyCheck(): Promise<void>;
  declineReadyCheck(): Promise<void>;
  confirmManualLobbyCreated(): void;
  playAgain(): Promise<void>;
  finishDemoGame(): void;
  updateSetting(key: keyof AppSettings, value: boolean): void;
  copyText(value: string, label: string): Promise<void>;
  openLeague(): Promise<void>;
  chooseLeagueLocation(): Promise<void>;
  setServerAddress(address: string): void;
  clearToast(): void;
}

export function useAppController(): AppController {
  const [state, dispatch] = useReducer(appReducer, initialState, () => {
    const hydrated = hydrateInitialState(localStorage.getItem('w3c.settings'));
    const savedAddress = localStorage.getItem('w3c.serverAddress');
    if (!savedAddress) return hydrated;
    try {
      return { ...hydrated, serverAddress: configureServerAddress(savedAddress) };
    } catch {
      localStorage.removeItem('w3c.serverAddress');
      return hydrated;
    }
  });
  const stateRef = useRef(state);
  const api = useMemo(() => new W3cApiClient(), []);
  const socketRef = useRef<TypedWebSocketClient | null>(null);
  const commandAcksRef = useRef(new Map<string, ClientEvent>());
  const commandsInFlightRef = useRef(new Set<string>());
  const ownedMatchIdsRef = useRef(new Set<string>());
  const lastGameflowReportRef = useRef(new Map<string, string>());
  const activeGameIdRef = useRef<number | null>(null);
  const gameResultChecksInFlightRef = useRef(new Set<string>());
  const reportedGameResultsRef = useRef(new Set<string>());
  const duelOperationsRef = useRef(new Set<string>());
  const inactiveGameflowPollsRef = useRef(new Map<string, number>());

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    const getInstallationPath = window.w3c?.league.getInstallationPath;
    if (!getInstallationPath) return;
    void getInstallationPath()
      .then((installationPath) => dispatch({
        type: 'SET_LEAGUE_INSTALLATION_PATH',
        path: installationPath,
      }))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    localStorage.setItem('w3c.settings', JSON.stringify(state.settings));
  }, [state.settings]);

  useEffect(() => {
    let active = true;
    const poll = async () => {
      try {
        const status = window.w3c ? await window.w3c.league.getStatus() : browserLeagueFallback;
        if (!active) return;
        dispatch({ type: 'SET_LEAGUE_STATUS', status });
        if (status.gameId) activeGameIdRef.current = status.gameId;

        const current = stateRef.current;
        const matchId = current.currentMatchId;
        if ((current.localBotMatch || current.duelMatch) && current.player && matchId) {
          if (status.state === 'CHAMP_SELECT' || status.state === 'IN_GAME') {
            inactiveGameflowPollsRef.current.delete(matchId);
          }
          if (status.state === 'IN_GAME' && current.lifecycle !== 'IN_GAME') {
            dispatch({ type: 'SET_LIFECYCLE', lifecycle: 'IN_GAME' });
            desktopNotification(
              'Game started',
              'The companion will stay quiet while you play.',
              current.settings.desktopNotifications,
            );
            return;
          }

          const leftActiveGameflow =
            status.state === 'CONNECTED' ||
            status.state === 'LOBBY' ||
            status.state === 'NOT_RUNNING';
          if (
            leftActiveGameflow &&
            (current.lifecycle === 'CHAMP_SELECT' || current.lifecycle === 'IN_GAME')
          ) {
            const inactivePolls = (inactiveGameflowPollsRef.current.get(matchId) ?? 0) + 1;
            inactiveGameflowPollsRef.current.set(matchId, inactivePolls);
            const closeAbandonedMatch = (message: string) => {
              dispatch({ type: 'SET_ERROR', message });
              if (current.duelMatch) void api.leaveDuelQueue().catch(() => undefined);
              inactiveGameflowPollsRef.current.delete(matchId);
              activeGameIdRef.current = null;
              dispatch({ type: 'LEAVE_QUEUE' });
            };

            if (current.lifecycle === 'CHAMP_SELECT') {
              if (shouldCloseInactiveGameflow(current.lifecycle, inactivePolls, Boolean(activeGameIdRef.current))) {
                closeAbandonedMatch(
                  'Champion select was left in League. The 1v1 match was closed.',
                );
              }
              return;
            }

            const gameId = activeGameIdRef.current;
            if (!gameId) {
              if (shouldCloseInactiveGameflow(current.lifecycle, inactivePolls, false)) {
                closeAbandonedMatch('League was left before a game result was available.');
              }
              return;
            }

            const reportKey = `local:${gameId}`;
            if (!gameResultChecksInFlightRef.current.has(reportKey) && window.w3c) {
              gameResultChecksInFlightRef.current.add(reportKey);
              try {
                const result = await window.w3c.league.getGameResult(gameId);
                if (!result) {
                  if (shouldCloseInactiveGameflow(current.lifecycle, inactivePolls, true)) {
                    closeAbandonedMatch(
                      'League stayed outside the game without a recorded result. The 1v1 match was closed.',
                    );
                  }
                  return;
                }
                if (result.outcome === 'UNKNOWN') {
                  dispatch({
                    type: 'SET_ERROR',
                    message: 'The local test game ended without a recorded winner.',
                  });
                  dispatch({ type: 'LEAVE_QUEUE' });
                  if (current.duelMatch) void api.finishDuel(matchId).catch(() => undefined);
                  inactiveGameflowPollsRef.current.delete(matchId);
                  activeGameIdRef.current = null;
                  return;
                }
                const currentTeam = current.participants.find(
                  (participant) => participant.isCurrentPlayer,
                )?.team;
                dispatch({
                  type: 'GAME_ENDED',
                  result: {
                    id: matchId,
                    playedAt: new Date().toISOString(),
                    result: result.outcome === `${currentTeam}_WIN` ? 'WIN' : 'LOSS',
                    role: current.primaryRole,
                    durationSeconds: result.durationSeconds ?? current.inGameElapsedSeconds,
                    score: result.score ?? '—',
                  },
                });
                if (current.duelMatch) void api.finishDuel(matchId).catch(() => undefined);
                inactiveGameflowPollsRef.current.delete(matchId);
                activeGameIdRef.current = null;
                reportedGameResultsRef.current.add(reportKey);
              } finally {
                gameResultChecksInFlightRef.current.delete(reportKey);
              }
            }
          }
          return;
        }

        if (!current.player || current.settings.demoMode || !matchId) return;

        if (
          ownedMatchIdsRef.current.has(matchId) &&
          (status.state === 'CHAMP_SELECT' || status.state === 'IN_GAME') &&
          lastGameflowReportRef.current.get(matchId) !== status.state
        ) {
          const sent = socketRef.current?.send({
            type: 'GAMEFLOW_OBSERVED',
            payload: {
              matchId,
              state: status.state,
              observedAt: new Date().toISOString(),
            },
          });
          if (sent) lastGameflowReportRef.current.set(matchId, status.state);
        }

        const gameId = activeGameIdRef.current;
        const reportKey = gameId ? `${matchId}:${gameId}` : null;
        const gameHasEnded = status.state !== 'CHAMP_SELECT' && status.state !== 'IN_GAME';
        if (
          !gameId ||
          !reportKey ||
          !gameHasEnded ||
          (current.lifecycle !== 'IN_GAME' && current.lifecycle !== 'POST_GAME') ||
          reportedGameResultsRef.current.has(reportKey) ||
          gameResultChecksInFlightRef.current.has(reportKey) ||
          !window.w3c
        ) {
          return;
        }

        gameResultChecksInFlightRef.current.add(reportKey);
        try {
          const result = await window.w3c.league.getGameResult(gameId);
          if (!result) return;
          const sent = socketRef.current?.send({
            type: 'GAME_ENDED',
            payload: {
              matchId,
              outcome: result.outcome,
              durationSeconds: result.durationSeconds,
              score: result.score,
              observedAt: new Date().toISOString(),
            },
          });
          if (sent) reportedGameResultsRef.current.add(reportKey);
        } finally {
          gameResultChecksInFlightRef.current.delete(reportKey);
        }
      } catch {
        if (active) {
          dispatch({
            type: 'SET_LEAGUE_STATUS',
            status: {
              ...browserLeagueFallback,
              observedAt: new Date().toISOString(),
              detail: 'Electron League bridge request failed (IPC_STATUS_FAILED).',
            },
          });
        }
      }
    };
    void poll();
    const interval = window.setInterval(() => void poll(), 5_000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [api]);

  const runCommandOnce = useCallback(
    (commandId: string, operation: () => Promise<ClientEvent>) => {
      const cached = commandAcksRef.current.get(commandId);
      if (cached) {
        socketRef.current?.send(cached);
        return;
      }
      if (commandsInFlightRef.current.has(commandId)) return;
      commandsInFlightRef.current.add(commandId);
      void operation()
        .then((acknowledgement) => {
          commandAcksRef.current.set(commandId, acknowledgement);
          socketRef.current?.send(acknowledgement);
        })
        .catch(() => {
          dispatch({
            type: 'SET_ERROR',
            message: 'A League command could not be processed; the server may safely retry it.',
          });
        })
        .finally(() => commandsInFlightRef.current.delete(commandId));
    },
    [],
  );

  const handleServerEvent = useCallback((event: ServerEvent) => {
    const current = stateRef.current;
    if (current.localBotMatch) return;
    const lifecycle = lifecycleForServerEvent(event);
    if (lifecycle) dispatch({ type: 'SET_LIFECYCLE', lifecycle });

    switch (event.type) {
      case 'MATCH_FOUND':
      case 'READY_CHECK_STARTED':
        dispatch({ type: 'MATCH_FOUND', readyCheckId: event.payload.readyCheckId });
        desktopNotification(
          'Match found',
          'Your team is waiting for your confirmation.',
          current.settings.desktopNotifications,
        );
        break;
      case 'READY_CHECK_UPDATED':
        dispatch({ type: 'READY_PROGRESS', acceptedCount: event.payload.acceptedCount });
        break;
      case 'MATCH_READY':
        dispatch({
          type: 'READY_COMPLETE',
          matchId: event.payload.matchId,
          participants: event.payload.participants,
        });
        break;
      case 'LOBBY_READY':
        dispatch({ type: 'JOINING_STARTED', lobby: toLobbyCredentials(event.payload.credentials) });
        break;
      case 'MANUAL_CREATE_LOBBY': {
        const { commandId, matchId, configuration } = event.payload;
        dispatch({
          type: 'MANUAL_CREATE_REQUIRED',
          commandId,
          matchId,
          lobby: toLobbyCredentials(configuration.credentials),
        });
        const acknowledgement = commandAcksRef.current.get(commandId);
        if (acknowledgement) {
          socketRef.current?.send(acknowledgement);
          dispatch({ type: 'MANUAL_CREATE_CONFIRMED' });
        }
        break;
      }
      case 'CREATE_LOBBY':
      case 'JOIN_LOBBY':
      case 'START_GAME': {
        if (event.type === 'JOIN_LOBBY') {
          dispatch({
            type: 'JOINING_STARTED',
            lobby: toLobbyCredentials(event.payload.credentials),
          });
        }
        const { commandId } = event.payload;
        if (event.type === 'START_GAME') ownedMatchIdsRef.current.add(event.payload.matchId);
        runCommandOnce(commandId, async () => {
          const execution = await handleLeagueCommand(event, window.w3c?.league);
          if (execution.fallbackRequired && execution.fallbackMessage) {
            dispatch({
              type: 'SHOW_TOAST',
              message: execution.fallbackMessage,
            });
          }
          return execution.acknowledgement;
        });
        break;
      }
      case 'PLAYER_JOINED':
        dispatch({ type: 'PLAYER_JOINED', playerId: event.payload.playerId });
        break;
      case 'CHAMP_SELECT':
        desktopNotification(
          'Champion select',
          'League is ready. Choose your champion.',
          current.settings.desktopNotifications,
        );
        break;
      case 'GAME_ENDED':
      case 'MATCH_FINISHED': {
        const currentTeam = current.participants.find(
          (participant) => participant.isCurrentPlayer,
        )?.team;
        const resolvedResult =
          event.payload.result ??
          (event.payload.outcome && event.payload.outcome !== 'UNKNOWN' && currentTeam
            ? event.payload.outcome === `${currentTeam}_WIN`
              ? 'WIN'
              : 'LOSS'
            : null);
        if (!resolvedResult) break;
        const summary: MatchSummary = {
          id: event.payload.matchId ?? current.currentMatchId ?? crypto.randomUUID(),
          playedAt: new Date().toISOString(),
          result: resolvedResult,
          role: current.primaryRole,
          durationSeconds: event.payload.durationSeconds ?? current.inGameElapsedSeconds,
          score: event.payload.score ?? '—',
        };
        dispatch({ type: 'GAME_ENDED', result: summary });
        break;
      }
      case 'MATCH_CANCELLED':
        dispatch({
          type: 'SET_ERROR',
          message: event.payload.reason ?? 'The match was cancelled by the server.',
        });
        dispatch({ type: 'LEAVE_QUEUE' });
        break;
      default:
        break;
    }
  }, [runCommandOnce]);

  useEffect(() => {
    if (!state.player || state.settings.demoMode) {
      socketRef.current?.close();
      socketRef.current = null;
      return;
    }
    const token = api.getToken();
    if (!token) return;

    const socket = new TypedWebSocketClient(runtimeConfig.webSocketUrl, handleServerEvent, (connected) => {
      dispatch({ type: 'SET_SERVER_STATUS', status: connected ? 'CONNECTED' : 'DISCONNECTED' });
      if (connected) {
        commandAcksRef.current.forEach((acknowledgement) => socket.send(acknowledgement));
      }
    });
    socket.connect(token);
    socketRef.current = socket;
    return () => {
      socket.close();
      socketRef.current = null;
    };
  }, [api, handleServerEvent, state.player, state.settings.demoMode]);

  useEffect(() => {
    if (!state.player || state.settings.demoMode) return;
    const heartbeat = () => {
      void api.heartbeat().catch(() => dispatch({ type: 'SET_SERVER_STATUS', status: 'DISCONNECTED' }));
      socketRef.current?.send({
        type: 'HEARTBEAT',
        payload: {
          leagueState: stateRef.current.league.state,
          adapterHealthy:
            stateRef.current.league.adapterHealthy &&
            stateRef.current.league.automationAvailable,
          observedAt: new Date().toISOString(),
        },
      });
    };
    heartbeat();
    const interval = window.setInterval(heartbeat, runtimeConfig.heartbeatIntervalMs);
    return () => window.clearInterval(interval);
  }, [api, state.player, state.settings.demoMode]);

  useEffect(() => {
    if (state.screen !== 'SEARCHING') return;
    let elapsed = 0;
    const interval = window.setInterval(() => {
      elapsed += 1;
      dispatch({
        type: 'QUEUE_TICK',
        playersSearching: state.settings.demoMode ? 38 + (elapsed % 7) : undefined,
      });
      if (state.settings.demoMode && elapsed >= 5) {
        window.clearInterval(interval);
        dispatch({ type: 'MATCH_FOUND', readyCheckId: 'demo-ready-check' });
        desktopNotification(
          'Match found',
          '10 players found. Accept the ready check.',
          state.settings.desktopNotifications,
        );
      }
    }, 1_000);
    return () => window.clearInterval(interval);
  }, [state.screen, state.settings.demoMode, state.settings.desktopNotifications]);

  useEffect(() => {
    const activeDuelScreen = state.screen === 'SEARCHING' || state.duelMatch;
    if (
      !state.player ||
      state.settings.demoMode ||
      !state.settings.duelMode ||
      !activeDuelScreen
    ) return;

    let active = true;
    const runOnce = (key: string, operation: () => Promise<void>) => {
      if (duelOperationsRef.current.has(key)) return;
      duelOperationsRef.current.add(key);
      void operation().catch(() => {
        duelOperationsRef.current.delete(key);
      });
    };
    const applySnapshot = (snapshot: DuelSnapshot) => {
      if (!active) return;
      const player = stateRef.current.player;
      if (!player || snapshot.status === 'WAITING' || !snapshot.matchId) return;
      if (snapshot.status === 'CANCELLED') {
        dispatch({ type: 'SET_ERROR', message: 'The other player left the 1v1 test.' });
        void api.leaveDuelQueue().catch(() => undefined);
        dispatch({ type: 'LEAVE_QUEUE' });
        return;
      }

      const matchId = snapshot.matchId;
      const owner = snapshot.ownerId === player.id;
      const credentials = snapshot.credentials
        ? {
            name: snapshot.credentials.lobbyName,
            password: snapshot.credentials.password,
            ...(snapshot.partyId ? { partyId: snapshot.partyId } : {}),
          }
        : null;
      if (!stateRef.current.duelMatch) {
        dispatch({
          type: 'DUEL_MATCHED',
          matchId,
          participants: snapshot.participants,
          owner,
        });
        desktopNotification(
          '1v1 found',
          'Your two-player custom lobby is being prepared.',
          stateRef.current.settings.desktopNotifications,
        );
      }

      if (snapshot.status === 'MATCHED' && owner && credentials && window.w3c) {
        runOnce(`${matchId}:create`, async () => {
          dispatch({ type: 'CREATION_STEP', step: 1 });
          const result = await window.w3c!.league.createCustomLobby({
            ...credentials,
            region: player.region,
            map: 'SUMMONERS_RIFT',
            expectedPlayers: 2,
          });
          if (!result.successful || result.status !== 'SUCCESS') {
            dispatch({
              type: 'SET_ERROR',
              message: `League refused the 1v1 lobby creation (${result.diagnosticCode}).`,
            });
            throw new Error(result.diagnosticCode);
          }
          await window.w3c!.league.setPositionPreferences(
            stateRef.current.primaryRole,
            stateRef.current.secondaryRole,
          );
          if (!result.externalLobbyId) {
            dispatch({
              type: 'SET_ERROR',
              message: 'League created the lobby but did not return its direct party ID.',
            });
            throw new Error('LCU_PARTY_ID_MISSING');
          }
          await api.duelLobbyCreated(matchId, result.externalLobbyId);
          dispatch({ type: 'SET_ERROR', message: null });
          dispatch({ type: 'CREATION_STEP', step: 3 });
          dispatch({ type: 'JOINING_STARTED', lobby: credentials });
          dispatch({ type: 'PLAYER_JOINED', playerId: player.id });
        });
      }

      if (snapshot.status === 'LOBBY_READY' && credentials) {
        if (owner) {
          if (stateRef.current.screen === 'CREATING_MATCH') {
            dispatch({ type: 'JOINING_STARTED', lobby: credentials });
            dispatch({ type: 'PLAYER_JOINED', playerId: player.id });
          }
        } else if (window.w3c) {
          runOnce(`${matchId}:join`, async () => {
            dispatch({ type: 'JOINING_STARTED', lobby: credentials });
            const result = await window.w3c!.league.joinCustomLobby(credentials);
            if (!result.successful || result.status !== 'SUCCESS') {
              if (result.status !== 'UNKNOWN') {
                dispatch({
                  type: 'SET_ERROR',
                  message: `League refused the 1v1 lobby join (${result.diagnosticCode}).`,
                });
              }
              throw new Error(result.diagnosticCode);
            }
            await window.w3c!.league.setPositionPreferences(
              stateRef.current.primaryRole,
              stateRef.current.secondaryRole,
            );
            await api.duelJoined(matchId);
            dispatch({ type: 'SET_ERROR', message: null });
            dispatch({ type: 'PLAYER_JOINED', playerId: player.id });
          });
        }
      }

      if (snapshot.status === 'BOTH_JOINED') {
        snapshot.participants.forEach((participant) =>
          dispatch({ type: 'PLAYER_JOINED', playerId: participant.id }),
        );
        const lifecycle = stateRef.current.lifecycle;
        if (
          lifecycle !== 'LOBBY_FULL' &&
          lifecycle !== 'STARTING' &&
          lifecycle !== 'CHAMP_SELECT' &&
          lifecycle !== 'IN_GAME'
        ) {
          dispatch({ type: 'SET_LIFECYCLE', lifecycle: 'LOBBY_FULL' });
        }
        if (owner && window.w3c) {
          runOnce(`${matchId}:start`, async () => {
            dispatch({ type: 'SET_LIFECYCLE', lifecycle: 'STARTING' });
            const result = await window.w3c!.league.startDuelGame();
            if (!result.successful || result.status !== 'SUCCESS') {
              dispatch({
                type: 'SET_ERROR',
                message: `League refused the 1v1 start (${result.diagnosticCode}).`,
              });
              throw new Error(result.diagnosticCode);
            }
            await api.duelStarted(matchId);
            dispatch({ type: 'SET_ERROR', message: null });
            dispatch({ type: 'SET_LIFECYCLE', lifecycle: 'CHAMP_SELECT' });
          });
        }
      }

      if (
        snapshot.status === 'STARTED' &&
        stateRef.current.lifecycle !== 'CHAMP_SELECT' &&
        stateRef.current.lifecycle !== 'IN_GAME'
      ) {
        dispatch({ type: 'SET_LIFECYCLE', lifecycle: 'CHAMP_SELECT' });
      }
    };

    const poll = async () => {
      try {
        applySnapshot(await api.getMyDuel());
      } catch {
        // A just-submitted join can briefly race this poll; the next tick is authoritative.
      }
    };
    void poll();
    const interval = window.setInterval(() => void poll(), 1_200);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [api, state.duelMatch, state.player, state.screen, state.settings.demoMode, state.settings.duelMode]);

  useEffect(() => {
    if (
      state.settings.demoMode ||
      state.settings.duelMode ||
      state.screen !== 'SEARCHING' ||
      runtimeConfig.localBotFillAfterMs <= 0
    ) {
      return;
    }
    const timeout = window.setTimeout(() => {
      if (stateRef.current.screen !== 'SEARCHING') return;
      void api.leaveQueue()
        .then(() => {
          if (stateRef.current.screen !== 'SEARCHING') return;
          dispatch({
            type: 'LOCAL_BOT_MATCH_FOUND',
            readyCheckId: `local-bots-${crypto.randomUUID()}`,
          });
          desktopNotification(
            'Test match filled',
            'No complete match was found. Nine League bots are ready.',
            stateRef.current.settings.desktopNotifications,
          );
        })
        .catch(() => dispatch({
          type: 'SET_ERROR',
          message: 'The local bot fallback could not leave the server queue cleanly.',
        }));
    }, runtimeConfig.localBotFillAfterMs);
    return () => window.clearTimeout(timeout);
  }, [api, state.screen, state.settings.demoMode, state.settings.duelMode]);

  useEffect(() => {
    if ((!state.settings.demoMode && !state.localBotMatch) || state.screen !== 'READY_CHECK') return;
    const countdown = window.setInterval(() => dispatch({ type: 'READY_TICK' }), 1_000);
    return () => window.clearInterval(countdown);
  }, [state.localBotMatch, state.screen, state.settings.demoMode]);

  useEffect(() => {
    if (state.screen === 'READY_CHECK' && state.readySecondsLeft === 0 && !state.acceptedByMe) {
      dispatch({ type: 'SET_ERROR', message: 'Ready check expired. You were removed from the queue.' });
      dispatch({ type: 'LEAVE_QUEUE' });
    }
  }, [state.acceptedByMe, state.readySecondsLeft, state.screen]);

  useEffect(() => {
    if (
      (!state.settings.demoMode && !state.localBotMatch) ||
      state.screen !== 'READY_CHECK' ||
      !state.acceptedByMe
    ) return;
    let count = Math.max(1, stateRef.current.acceptedCount);
    const interval = window.setInterval(() => {
      count += 1;
      dispatch({ type: 'READY_PROGRESS', acceptedCount: count });
      if (count >= 10) {
        window.clearInterval(interval);
        const player = stateRef.current.player;
        if (!player) return;
        const participants = stateRef.current.localBotMatch
          ? createLocalBotParticipants(
              player.id,
              player.gameName,
              player.tagLine,
              stateRef.current.primaryRole,
            )
          : createDemoParticipants(
          player.id,
          player.gameName,
          player.tagLine,
          stateRef.current.primaryRole,
            );
        window.setTimeout(
          () =>
            dispatch({
              type: 'READY_COMPLETE',
              matchId: 'match-demo-live',
              participants,
            }),
          500,
        );
      }
    }, 380);
    return () => window.clearInterval(interval);
  }, [state.acceptedByMe, state.localBotMatch, state.screen, state.settings.demoMode]);

  useEffect(() => {
    if (!state.settings.demoMode || state.screen !== 'CREATING_MATCH') return;
    const timers = [
      window.setTimeout(() => dispatch({ type: 'CREATION_STEP', step: 1 }), 500),
      window.setTimeout(() => dispatch({ type: 'CREATION_STEP', step: 2 }), 1_100),
      window.setTimeout(() => dispatch({ type: 'CREATION_STEP', step: 3 }), 1_750),
      window.setTimeout(() => {
        const lobby = createDemoLobby();
        dispatch({ type: 'JOINING_STARTED', lobby });
      }, 2_450),
    ];
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [state.screen, state.settings.demoMode]);

  useEffect(() => {
    if (!state.localBotMatch || state.screen !== 'CREATING_MATCH') return;
    if (!window.w3c || !state.player) {
      dispatch({ type: 'SET_ERROR', message: 'The Electron League bridge is unavailable.' });
      return;
    }
    let active = true;
    const suffix = crypto.randomUUID().replaceAll('-', '').slice(0, 8).toUpperCase();
    const lobby = { name: `W3C-BOTS-${suffix}`, password: suffix };
    dispatch({ type: 'CREATION_STEP', step: 1 });
    void window.w3c.league.createBotLobby({
      ...lobby,
      region: state.player.region,
      map: 'SUMMONERS_RIFT',
      expectedPlayers: 10,
      playerRole: state.primaryRole,
      secondaryRole: state.secondaryRole,
    }).then((result) => {
      if (!active) return;
      if (!result.successful || result.status !== 'SUCCESS') {
        dispatch({
          type: 'SET_ERROR',
          message: `League bot lobby creation failed (${result.diagnosticCode}).`,
        });
        return;
      }
      dispatch({ type: 'CREATION_STEP', step: 3 });
      dispatch({ type: 'JOINING_STARTED', lobby });
    }).catch(() => {
      if (active) dispatch({ type: 'SET_ERROR', message: 'League bot lobby creation failed.' });
    });
    return () => {
      active = false;
    };
  }, [state.localBotMatch, state.player, state.primaryRole, state.screen, state.secondaryRole]);

  useEffect(() => {
    if ((!state.settings.demoMode && !state.localBotMatch) || state.screen !== 'JOINING_LOBBY') return;
    // Snapshot the server-assigned roster once. PLAYER_JOINED replaces the participant array;
    // depending on it would restart this interval and repeatedly join Player01.
    const ids = stateRef.current.participants.map((participant) => participant.id);
    let index = 0;
    const interval = window.setInterval(() => {
      const playerId = ids[index];
      if (playerId) dispatch({ type: 'PLAYER_JOINED', playerId });
      index += 1;
      if (index >= ids.length) {
        window.clearInterval(interval);
        window.setTimeout(() => dispatch({ type: 'SET_LIFECYCLE', lifecycle: 'LOBBY_FULL' }), 650);
      }
    }, 420);
    return () => window.clearInterval(interval);
  }, [state.lobby, state.localBotMatch, state.screen, state.settings.demoMode]);

  useEffect(() => {
    if ((!state.settings.demoMode && !state.localBotMatch) || state.screen !== 'MATCH_OVERVIEW') return;
    let timeout: number | undefined;
    switch (state.lifecycle) {
      case 'LOBBY_FULL':
        timeout = window.setTimeout(
          () => dispatch({ type: 'SET_LIFECYCLE', lifecycle: 'LOBBY_VALIDATING' }),
          800,
        );
        break;
      case 'LOBBY_VALIDATING':
        timeout = window.setTimeout(
          () => dispatch({ type: 'SET_LIFECYCLE', lifecycle: 'LOBBY_VALID' }),
          1_400,
        );
        break;
      case 'LOBBY_VALID':
        timeout = window.setTimeout(() => {
          dispatch({ type: 'SET_LIFECYCLE', lifecycle: 'STARTING' });
        }, 900);
        break;
      case 'STARTING':
        if (state.localBotMatch && window.w3c) {
          void window.w3c.league.startBotGame().then((result) => {
            if (result.successful && result.status === 'SUCCESS') {
              dispatch({ type: 'SET_LIFECYCLE', lifecycle: 'CHAMP_SELECT' });
            } else {
              dispatch({
                type: 'SET_ERROR',
                message: `League refused the test game start (${result.diagnosticCode}).`,
              });
            }
          });
        } else {
          timeout = window.setTimeout(
            () => dispatch({ type: 'SET_LIFECYCLE', lifecycle: 'CHAMP_SELECT' }),
            1_500,
          );
        }
        break;
      case 'CHAMP_SELECT':
        if (!state.localBotMatch) {
          timeout = window.setTimeout(() => {
            dispatch({ type: 'SET_LIFECYCLE', lifecycle: 'IN_GAME' });
            desktopNotification(
              'Game started',
              'The companion will stay quiet while you play.',
              state.settings.desktopNotifications,
            );
          }, 3_000);
        }
        break;
      default:
        break;
    }
    return () => {
      if (timeout !== undefined) window.clearTimeout(timeout);
    };
  }, [
    state.lifecycle,
    state.localBotMatch,
    state.screen,
    state.settings.demoMode,
    state.settings.desktopNotifications,
  ]);

  const finishDemoGame = useCallback(() => {
    const current = stateRef.current;
    if (!current.currentMatchId) return;
    dispatch({
      type: 'GAME_ENDED',
      result: {
        id: current.currentMatchId,
        playedAt: new Date().toISOString(),
        result: 'WIN',
        role: current.primaryRole,
        durationSeconds: Math.max(1_764, current.inGameElapsedSeconds),
        score: '32 – 25',
      },
    });
  }, []);

  useEffect(() => {
    if (
      (!state.settings.demoMode && !state.localBotMatch && !state.duelMatch) ||
      state.lifecycle !== 'IN_GAME'
    ) return;
    const interval = window.setInterval(() => dispatch({ type: 'GAME_TICK' }), 1_000);
    const finish = state.settings.demoMode
      ? window.setTimeout(finishDemoGame, 10_000)
      : undefined;
    return () => {
      window.clearInterval(interval);
      if (finish !== undefined) window.clearTimeout(finish);
    };
  }, [finishDemoGame, state.duelMatch, state.lifecycle, state.localBotMatch, state.settings.demoMode]);

  const login = useCallback(
    async (gameName: string, tagLine: string, region: string, accessCode = '') => {
      dispatch({ type: 'SET_ERROR', message: null });
      if (!stateRef.current.settings.demoMode) {
        try {
          const normalizedAddress = configureServerAddress(stateRef.current.serverAddress);
          localStorage.setItem('w3c.serverAddress', normalizedAddress);
          dispatch({ type: 'SET_SERVER_ADDRESS', address: normalizedAddress });
        } catch {
          dispatch({
            type: 'SET_ERROR',
            message: 'Enter a valid server address, for example http://192.168.1.12:8080.',
          });
          return;
        }
      }
      const normalizedName = gameName.trim();
      const normalizedTag = tagLine.replace(/^#/, '').trim().toUpperCase();
      if (!normalizedName || !normalizedTag) {
        dispatch({ type: 'SET_ERROR', message: 'Enter both your Riot game name and tag.' });
        return;
      }

      try {
        let player: PlayerIdentity;
        if (stateRef.current.settings.demoMode) {
          player = {
            id: 'demo-current-player',
            gameName: normalizedName,
            tagLine: normalizedTag,
            region,
          };
          dispatch({ type: 'SET_SERVER_STATUS', status: 'SIMULATION' });
        } else {
          if (!window.w3c) {
            throw new Error('Secure authentication requires the desktop companion');
          }
          const leagueIdentity = await window.w3c.league.getIdentity();
          if (!leagueIdentity) {
            dispatch({
              type: 'SET_ERROR',
              message: 'Start League and sign in before connecting to W3C-LoL.',
            });
            return;
          }
          const suppliedCode = accessCode.trim();
          const storedCode = suppliedCode ? null : await window.w3c.auth.getAccessCode();
          const pairingCode = suppliedCode || storedCode;
          if (!pairingCode) {
            dispatch({
              type: 'SET_ERROR',
              message: 'Enter the pairing code provided by the server owner.',
            });
            return;
          }
          dispatch({ type: 'SET_SERVER_STATUS', status: 'CONNECTING' });
          player = await api.login({
            riotPuuid: leagueIdentity.riotPuuid,
            gameName: leagueIdentity.gameName,
            tagLine: leagueIdentity.tagLine,
            region: leagueIdentity.region,
            accessCode: pairingCode,
          });
          if (suppliedCode) await window.w3c.auth.saveAccessCode(suppliedCode);
          dispatch({ type: 'SET_SERVER_STATUS', status: 'CONNECTED' });
        }
        dispatch({ type: 'LOGIN_SUCCESS', player });
      } catch (error) {
        dispatch({ type: 'SET_SERVER_STATUS', status: 'DISCONNECTED' });
        dispatch({
          type: 'SET_ERROR',
          message: error instanceof ApiError && error.status === 401
            ? 'The pairing code is invalid or already belongs to another League account.'
            : 'Unable to reach the W3C-LoL server. Enable demo mode to explore the full flow.',
        });
      }
    },
    [api],
  );

  const findMatch = useCallback(async () => {
    const current = stateRef.current;
    activeGameIdRef.current = null;
    inactiveGameflowPollsRef.current.clear();
    duelOperationsRef.current.clear();
    dispatch({ type: 'SET_ERROR', message: null });
    if (!current.settings.demoMode && !current.localBotMatch) {
      try {
        if (current.settings.duelMode) {
          await api.joinDuelQueue({
            primaryRole: current.primaryRole,
            secondaryRole: current.secondaryRole,
          });
        } else {
          await api.joinQueue({
            primaryRole: current.primaryRole,
            secondaryRole: current.secondaryRole,
          });
        }
      } catch {
        dispatch({ type: 'SET_ERROR', message: 'The queue is unavailable. Please try again.' });
        return;
      }
    }
    dispatch({ type: 'FIND_MATCH' });
  }, [api]);

  const playAgain = useCallback(async () => {
    const current = stateRef.current;
    activeGameIdRef.current = null;
    inactiveGameflowPollsRef.current.clear();
    duelOperationsRef.current.clear();
    dispatch({ type: 'SET_ERROR', message: null });
    if (!current.settings.demoMode) {
      try {
        if (current.settings.duelMode) {
          await api.joinDuelQueue({
            primaryRole: current.primaryRole,
            secondaryRole: current.secondaryRole,
          });
        } else {
          await api.joinQueue({
            primaryRole: current.primaryRole,
            secondaryRole: current.secondaryRole,
          });
        }
      } catch {
        dispatch({
          type: 'SET_ERROR',
          message: 'Requeue failed. Your roles are still selected; try again when the server is available.',
        });
        return;
      }
    }
    dispatch({ type: 'PLAY_AGAIN' });
  }, [api]);

  const leaveQueue = useCallback(async () => {
    const current = stateRef.current;
    inactiveGameflowPollsRef.current.clear();
    if (!current.settings.demoMode && !current.localBotMatch) {
      try {
        if (current.settings.duelMode || current.duelMatch) {
          await api.leaveDuelQueue();
        } else {
          await api.leaveQueue();
        }
      } catch {
        dispatch({ type: 'SET_ERROR', message: 'Could not leave the queue cleanly.' });
      }
    }
    dispatch({ type: 'LEAVE_QUEUE' });
  }, [api]);

  const acceptReadyCheck = useCallback(async () => {
    const current = stateRef.current;
    if (!current.readyCheckId || current.acceptedByMe) return;
    if (!current.settings.demoMode && !current.localBotMatch) {
      try {
        await api.acceptReadyCheck(current.readyCheckId);
      } catch {
        dispatch({ type: 'SET_ERROR', message: 'Your confirmation was not received. Try again.' });
        return;
      }
    }
    dispatch({ type: 'ACCEPT_READY_CHECK' });
  }, [api]);

  const declineReadyCheck = useCallback(async () => {
    const current = stateRef.current;
    if (!current.settings.demoMode && !current.localBotMatch && current.readyCheckId) {
      try {
        await api.declineReadyCheck(current.readyCheckId);
      } catch {
        dispatch({ type: 'SET_ERROR', message: 'Could not send the decline response.' });
      }
    }
    dispatch({ type: 'LEAVE_QUEUE' });
  }, [api]);

  const copyText = useCallback(async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      dispatch({ type: 'SHOW_TOAST', message: `${label} copied` });
    } catch {
      dispatch({ type: 'SHOW_TOAST', message: `Copy failed — select the ${label.toLowerCase()} manually` });
    }
  }, []);

  const openLeague = useCallback(async () => {
    if (!window.w3c) {
      dispatch({ type: 'SHOW_TOAST', message: 'Open League is available in the desktop companion' });
      return;
    }
    const result = await window.w3c.league.openLeague();
    dispatch({
      type: 'SHOW_TOAST',
      message: result.opened ? 'League Client opened' : (result.reason ?? 'League Client could not be opened'),
    });
  }, []);

  const chooseLeagueLocation = useCallback(async () => {
    if (!window.w3c) {
      dispatch({ type: 'SET_ERROR', message: 'League folder selection requires the desktop companion.' });
      return;
    }
    try {
      const result = await window.w3c.league.selectInstallationPath();
      if (result.error) {
        dispatch({ type: 'SET_ERROR', message: result.error });
        return;
      }
      if (!result.selected || !result.path) return;
      dispatch({ type: 'SET_LEAGUE_INSTALLATION_PATH', path: result.path });
      dispatch({ type: 'SET_ERROR', message: null });
      const status = await window.w3c.league.getStatus();
      dispatch({ type: 'SET_LEAGUE_STATUS', status });
      dispatch({ type: 'SHOW_TOAST', message: 'League installation folder saved' });
    } catch {
      dispatch({ type: 'SET_ERROR', message: 'The League installation folder could not be saved.' });
    }
  }, []);

  const updateSetting = useCallback((key: keyof AppSettings, value: boolean) => {
    dispatch({ type: 'SET_SETTING', key, value });
  }, []);

  const confirmManualLobbyCreated = useCallback(() => {
    const command = stateRef.current.manualCreate;
    if (!command || command.confirmed) return;
    const acknowledgement: ClientEvent = {
      type: 'LOBBY_CREATED',
      payload: {
        commandId: command.commandId,
        matchId: command.matchId,
        successful: true,
        status: 'SUCCESS',
        observedAt: new Date().toISOString(),
      },
    };
    commandAcksRef.current.set(command.commandId, acknowledgement);
    socketRef.current?.send(acknowledgement);
    dispatch({ type: 'MANUAL_CREATE_CONFIRMED' });
    dispatch({ type: 'SHOW_TOAST', message: 'Lobby creation reported — awaiting server validation' });
  }, []);

  return {
    state,
    login,
    logout: () => dispatch({ type: 'LOGOUT' }),
    navigate: (screen) => dispatch({ type: 'NAVIGATE', screen }),
    setPrimaryRole: (role) => dispatch({ type: 'SET_PRIMARY_ROLE', role }),
    setSecondaryRole: (role) => dispatch({ type: 'SET_SECONDARY_ROLE', role }),
    findMatch,
    leaveQueue,
    acceptReadyCheck,
    declineReadyCheck,
    confirmManualLobbyCreated,
    playAgain,
    finishDemoGame,
    updateSetting,
    copyText,
    openLeague,
    chooseLeagueLocation,
    setServerAddress: (address) => dispatch({ type: 'SET_SERVER_ADDRESS', address }),
    clearToast: () => dispatch({ type: 'CLEAR_TOAST' }),
  };
}
