import { useCallback, useEffect, useMemo, useReducer, useRef } from 'react';
import { appReducer, hydrateInitialState, initialState } from '../domain/appReducer';
import { createDemoLobby, createDemoParticipants, createLocalBotParticipants } from '../domain/demo';
import { shouldCloseInactiveGameflow } from '../domain/gameflowExit';
import type {
  AppSettings,
  AppState,
  DuelWinCondition,
  DuelSnapshot,
  LeagueDuelVictory,
  LeagueStatus,
  MatchSummary,
  PlayerIdentity,
  Role,
} from '../domain/types';
import { ApiError, W3cApiClient } from '../services/apiClient';
import { handleLeagueCommand, toLobbyCredentials } from '../services/leagueCommandHandler';
import { loadMatchHistory, saveMatchHistory } from '../services/matchHistoryStorage';
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

interface PendingDuelCompletion {
  result: MatchSummary;
  notificationTitle: string;
  notificationBody: string;
  acknowledgeServer: boolean;
  inactivePolls: number;
}

function duelConditionLabel(condition: DuelWinCondition | null | undefined): string {
  switch (condition) {
    case 'CREEP_SCORE_100': return '100 CS';
    case 'FIRST_TURRET': return 'first turret';
    default: return 'first blood';
  }
}

function duelVictoryScore(victory: LeagueDuelVictory, winningTeam: 'BLUE' | 'RED'): string {
  const formatValue = (value: number) => {
    if (victory.condition === 'CREEP_SCORE_100') return `${value} CS`;
    const unit = victory.condition === 'FIRST_TURRET' ? 'turret' : 'kill';
    return `${value} ${unit}${value === 1 ? '' : 's'}`;
  };
  const winner = formatValue(victory.winnerValue);
  const loser = formatValue(victory.loserValue);
  return winningTeam === 'BLUE' ? `${winner} — ${loser}` : `${loser} — ${winner}`;
}

function duelVictoryMessage(victory: LeagueDuelVictory): string {
  switch (victory.condition) {
    case 'CREEP_SCORE_100':
      return `${victory.winnerName} reached 100 CS first (${victory.winnerValue}–${victory.loserValue}).`;
    case 'FIRST_TURRET':
      return `${victory.winnerName} destroyed the first turret.`;
    default:
      return `${victory.winnerName} scored first blood.`;
  }
}

export interface AppController {
  state: AppState;
  login(gameName: string, tagLine: string, region: string): Promise<void>;
  logout(): void;
  navigate(screen: 'HOME' | 'PLAY' | 'HISTORY' | 'CHAT' | 'SETTINGS'): void;
  sendChatMessage(content: string): Promise<boolean>;
  setPrimaryRole(role: Role): void;
  setSecondaryRole(role: Role): void;
  inviteToParty(riotId: string): Promise<boolean>;
  removePartyMember(memberId: string): Promise<void>;
  acceptPartyInvitation(invitationId: string): Promise<void>;
  declinePartyInvitation(invitationId: string): Promise<void>;
  leaveParty(): Promise<void>;
  findMatch(): Promise<void>;
  leaveQueue(): Promise<void>;
  acceptReadyCheck(): Promise<void>;
  declineReadyCheck(): Promise<void>;
  confirmManualLobbyCreated(): void;
  playAgain(): Promise<void>;
  finishDemoGame(): void;
  setMatchmakingMode(mode: 'DUEL_1V1' | 'COMMUNITY_5V5'): void;
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
  const duelVictoryChecksInFlightRef = useRef(new Set<string>());
  const reportedDuelVictoryRef = useRef(new Set<string>());
  const pendingDuelCompletionsRef = useRef(new Map<string, PendingDuelCompletion>());
  const duelExitGuardInFlightRef = useRef(new Set<string>());
  const duelCompletionInFlightRef = useRef(new Set<string>());
  const inactiveGameflowPollsRef = useRef(new Map<string, number>());
  const leagueWasRunningRef = useRef<boolean | null>(null);
  const notifiedPartyInvitationsRef = useRef(new Set<string>());

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
    if (state.player) saveMatchHistory(state.player.id, state.history);
  }, [state.history, state.player]);

  useEffect(() => {
    const invitation = state.partyInvitations.find(
      (candidate) => !notifiedPartyInvitationsRef.current.has(candidate.id),
    );
    if (!invitation) return;
    notifiedPartyInvitationsRef.current.add(invitation.id);
    dispatch({
      type: 'SHOW_TOAST',
      message: `${invitation.gameName}#${invitation.tagLine} invited you — open the party invitation to join`,
    });
    desktopNotification(
      'Pinkward party invitation',
      `${invitation.gameName}#${invitation.tagLine} invited you to their group.`,
      state.settings.desktopNotifications,
    );
  }, [state.partyInvitations, state.settings.desktopNotifications]);

  useEffect(() => {
    let active = true;
    const poll = async () => {
      try {
        const status = window.w3c ? await window.w3c.league.getStatus() : browserLeagueFallback;
        if (!active) return;
        dispatch({ type: 'SET_LEAGUE_STATUS', status });
        if (status.gameId) activeGameIdRef.current = status.gameId;

        const current = stateRef.current;
        const leagueWasRunning = leagueWasRunningRef.current;
        leagueWasRunningRef.current = status.running;
        if (
          current.player &&
          !current.settings.demoMode &&
          leagueWasRunning === true &&
          !status.running
        ) {
          dispatch({ type: 'SHOW_TOAST', message: 'League Client closed — reopen it to continue' });
          desktopNotification(
            'League Client closed',
            'Reopen League and sign in to continue using Pinkward.',
            current.settings.desktopNotifications,
          );
        }
        const matchId = current.currentMatchId;
        if ((current.localBotMatch || current.duelMatch) && current.player && matchId) {
          const pendingDuel = pendingDuelCompletionsRef.current.get(matchId);
          if (current.duelMatch && pendingDuel) {
            if (current.lifecycle !== 'DUEL_ENDING') {
              dispatch({ type: 'SET_LIFECYCLE', lifecycle: 'DUEL_ENDING' });
            }
            if (status.state === 'IN_GAME') {
              pendingDuel.inactivePolls = 0;
              if (window.w3c && !duelExitGuardInFlightRef.current.has(matchId)) {
                duelExitGuardInFlightRef.current.add(matchId);
                void window.w3c.league.exitDuelGame()
                  .catch(() => undefined)
                  .finally(() => duelExitGuardInFlightRef.current.delete(matchId));
              }
              return;
            }

            const riotReleasedGame =
              status.state === 'CONNECTED' ||
              status.state === 'LOBBY' ||
              status.state === 'NOT_RUNNING';
            if (!riotReleasedGame) return;

            pendingDuel.inactivePolls += 1;
            if (pendingDuel.inactivePolls < 2 || duelCompletionInFlightRef.current.has(matchId)) {
              return;
            }
            duelCompletionInFlightRef.current.add(matchId);
            try {
              if (pendingDuel.acknowledgeServer) {
                await api.finishDuel(matchId);
              }
              dispatch({ type: 'GAME_ENDED', result: pendingDuel.result });
              desktopNotification(
                pendingDuel.notificationTitle,
                pendingDuel.notificationBody,
                current.settings.desktopNotifications,
              );
              pendingDuelCompletionsRef.current.delete(matchId);
              inactiveGameflowPollsRef.current.delete(matchId);
              activeGameIdRef.current = null;
              await api.getMyStats()
                .then((stats) => dispatch({ type: 'SET_STATS', stats }))
                .catch(() => undefined);
            } catch {
              pendingDuel.inactivePolls = 0;
              dispatch({
                type: 'SHOW_TOAST',
                message: 'Riot closed the game, but Pinkward is still synchronizing the duel result.',
              });
            } finally {
              duelCompletionInFlightRef.current.delete(matchId);
            }
            return;
          }

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

          if (
            current.duelMatch &&
            status.state === 'IN_GAME' &&
            current.lifecycle === 'IN_GAME' &&
            window.w3c &&
            !reportedDuelVictoryRef.current.has(matchId) &&
            !duelVictoryChecksInFlightRef.current.has(matchId)
          ) {
            duelVictoryChecksInFlightRef.current.add(matchId);
            try {
              const victory = await window.w3c.league.getDuelVictory();
              if (victory) {
                const currentTeam = current.participants.find(
                  (participant) => participant.isCurrentPlayer,
                )?.team;
                if (!currentTeam) {
                  dispatch({
                    type: 'SET_ERROR',
                    message: 'A 1v1 win condition was detected, but your assigned team is unknown.',
                  });
                  return;
                }

                reportedDuelVictoryRef.current.add(matchId);
                const winningTeam = victory.localPlayerWon
                  ? currentTeam
                  : currentTeam === 'BLUE' ? 'RED' : 'BLUE';
                const outcome = winningTeam === 'BLUE' ? 'BLUE_WIN' : 'RED_WIN';
                const durationSeconds = Math.max(0, Math.round(victory.eventTimeSeconds));
                const score = duelVictoryScore(victory, winningTeam);
                const completedAt = new Date().toISOString();

                try {
                  await api.finishDuel(matchId, {
                    outcome,
                    winCondition: victory.condition,
                    durationSeconds,
                    score,
                    completedAt,
                  });
                } catch {
                  reportedDuelVictoryRef.current.delete(matchId);
                  dispatch({
                    type: 'SET_ERROR',
                    message: 'The 1v1 win condition was detected, but the server could not save the result.',
                  });
                  return;
                }
                pendingDuelCompletionsRef.current.set(matchId, {
                  result: {
                    id: matchId,
                    playedAt: completedAt,
                    result: victory.localPlayerWon ? 'WIN' : 'LOSS',
                    role: current.primaryRole,
                    durationSeconds,
                    score,
                  },
                  notificationTitle: victory.localPlayerWon ? '1v1 victory' : '1v1 defeat',
                  notificationBody: `${duelVictoryMessage(victory)} Waiting for Riot to close the custom game.`,
                  acknowledgeServer: false,
                  inactivePolls: 0,
                });
                dispatch({ type: 'SET_LIFECYCLE', lifecycle: 'DUEL_ENDING' });
                desktopNotification(
                  `${duelConditionLabel(victory.condition)} confirmed`,
                  'Do not press Reconnect. Pinkward is closing the custom game for both players.',
                  current.settings.desktopNotifications,
                );
                duelExitGuardInFlightRef.current.add(matchId);
                const exitedGame = await window.w3c.league.exitDuelGame()
                  .catch(() => null)
                  .finally(() => duelExitGuardInFlightRef.current.delete(matchId));
                if (!exitedGame?.successful) {
                  dispatch({
                    type: 'SHOW_TOAST',
                    message: 'Riot still marks the game reconnectable. Do not reconnect; the exit guard remains active.',
                  });
                }
                return;
              }
            } finally {
              duelVictoryChecksInFlightRef.current.delete(matchId);
            }
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
                  if (current.duelMatch) {
                    await api.finishDuel(matchId, {
                      outcome: result.outcome,
                      durationSeconds: result.durationSeconds,
                      score: result.score,
                      completedAt: new Date().toISOString(),
                    }).catch(() => undefined);
                    await api.getMyStats()
                      .then((stats) => dispatch({ type: 'SET_STATS', stats }))
                      .catch(() => undefined);
                  }
                  inactiveGameflowPollsRef.current.delete(matchId);
                  activeGameIdRef.current = null;
                  return;
                }
                const currentTeam = current.participants.find(
                  (participant) => participant.isCurrentPlayer,
                )?.team;
                const recordedOutcome = current.duelMatch ? 'UNKNOWN' : result.outcome;
                dispatch({
                  type: 'GAME_ENDED',
                  result: {
                    id: matchId,
                    playedAt: new Date().toISOString(),
                    result: recordedOutcome === 'UNKNOWN'
                      ? 'UNKNOWN'
                      : recordedOutcome === `${currentTeam}_WIN` ? 'WIN' : 'LOSS',
                    role: current.primaryRole,
                    durationSeconds: result.durationSeconds ?? current.inGameElapsedSeconds,
                    score: result.score ?? '—',
                  },
                });
                if (current.duelMatch) {
                  await api.finishDuel(matchId, {
                    outcome: 'UNKNOWN',
                    durationSeconds: result.durationSeconds ?? current.inGameElapsedSeconds,
                    score: result.score,
                    completedAt: new Date().toISOString(),
                  }).catch(() => undefined);
                  await api.getMyStats()
                    .then((stats) => dispatch({ type: 'SET_STATS', stats }))
                    .catch(() => undefined);
                }
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

  const refreshStats = useCallback(async () => {
    try {
      const stats = await api.getMyStats();
      dispatch({ type: 'SET_STATS', stats });
    } catch {
      // Match history remains available from the local cache while the server is unavailable.
    }
  }, [api]);

  const refreshChat = useCallback(async () => {
    try {
      const messages = await api.getChatMessages();
      dispatch({ type: 'SET_CHAT_MESSAGES', messages });
    } catch {
      // The live socket can continue delivering messages if history loading fails temporarily.
    }
  }, [api]);

  const handleServerEvent = useCallback((event: ServerEvent) => {
    const current = stateRef.current;
    if (current.localBotMatch) return;
    const lifecycle = lifecycleForServerEvent(event);
    if (lifecycle) dispatch({ type: 'SET_LIFECYCLE', lifecycle });

    switch (event.type) {
      case 'QUEUE_JOINED':
        dispatch({ type: 'FIND_MATCH' });
        break;
      case 'QUEUE_LEFT':
        dispatch({ type: 'LEAVE_QUEUE' });
        break;
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
      case 'PARTY_INVITATION_RECEIVED':
        dispatch({ type: 'RECEIVE_PARTY_INVITATION', invitation: event.payload });
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
        window.setTimeout(() => void refreshStats(), 1_000);
        break;
      }
      case 'MATCH_CANCELLED':
        dispatch({
          type: 'SET_ERROR',
          message: event.payload.reason ?? 'The match was cancelled by the server.',
        });
        dispatch({ type: 'LEAVE_QUEUE' });
        break;
      case 'CHAT_MESSAGE':
        dispatch({ type: 'RECEIVE_CHAT_MESSAGE', message: event.payload });
        break;
      default:
        break;
    }
  }, [refreshStats, runCommandOnce]);

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
      void api.getParty()
        .then((context) => dispatch({ type: 'SET_PARTY_CONTEXT', context }))
        .catch(() => undefined);
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
    if (!state.player || !state.partyId || state.settings.demoMode) return;
    const timeout = window.setTimeout(() => {
      void api.updatePartyRoles(state.primaryRole, state.secondaryRole)
        .then((context) => dispatch({ type: 'SET_PARTY_CONTEXT', context }))
        .catch(() => undefined);
    }, 250);
    return () => window.clearTimeout(timeout);
  }, [api, state.partyId, state.player, state.primaryRole, state.secondaryRole, state.settings.demoMode]);

  useEffect(() => {
    if (state.screen !== 'SEARCHING') return;
    let elapsed = 0;
    const interval = window.setInterval(() => {
      elapsed += 1;
      dispatch({
        type: 'QUEUE_TICK',
        playersSearching: state.settings.demoMode
          ? state.settings.duelMode ? Math.min(2, 1 + (elapsed % 2)) : 38 + (elapsed % 7)
          : undefined,
      });
      if (state.settings.demoMode && elapsed >= 5) {
        window.clearInterval(interval);
        dispatch({ type: 'MATCH_FOUND', readyCheckId: 'demo-ready-check' });
        desktopNotification(
          'Match found',
          state.settings.duelMode
            ? 'Your 1v1 opponent is ready. Accept the ready check.'
            : '10 players found. Accept the ready check.',
          state.settings.desktopNotifications,
        );
      }
    }, 1_000);
    return () => window.clearInterval(interval);
  }, [state.screen, state.settings.demoMode, state.settings.desktopNotifications, state.settings.duelMode]);

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
        dispatch({ type: 'SET_ERROR', message: 'The other player left the 1v1 match.' });
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

      if (snapshot.status === 'FINISHED') {
        if (!snapshot.result || !window.w3c) {
          dispatch({
            type: 'SET_ERROR',
            message: 'The duel ended, but its authoritative result is unavailable.',
          });
          return;
        }
        runOnce(`${matchId}:server-finished`, async () => {
          reportedDuelVictoryRef.current.add(matchId);
          const currentTeam = snapshot.participants.find(
            (participant) => participant.isCurrentPlayer,
          )?.team;
          const localWon = currentTeam
            ? snapshot.result!.outcome === `${currentTeam}_WIN`
            : false;
          const durationSeconds = snapshot.result!.durationSeconds
            ?? stateRef.current.inGameElapsedSeconds;
          const score = snapshot.result!.score ?? '1 — 0';
          pendingDuelCompletionsRef.current.set(matchId, {
            result: {
              id: matchId,
              playedAt: snapshot.result!.completedAt,
              result: snapshot.result!.outcome === 'UNKNOWN'
                ? 'UNKNOWN'
                : localWon ? 'WIN' : 'LOSS',
              role: stateRef.current.primaryRole,
              durationSeconds,
              score,
            },
            notificationTitle: localWon ? '1v1 victory' : '1v1 defeat',
            notificationBody: 'Riot released the custom game. The server-confirmed result is recorded.',
            acknowledgeServer: true,
            inactivePolls: 0,
          });
          dispatch({ type: 'SET_LIFECYCLE', lifecycle: 'DUEL_ENDING' });
          desktopNotification(
            `${duelConditionLabel(snapshot.result!.winCondition)} confirmed`,
            'Do not press Reconnect. Pinkward is closing the custom game for both players.',
            stateRef.current.settings.desktopNotifications,
          );
          duelExitGuardInFlightRef.current.add(matchId);
          const exitedGame = await window.w3c!.league.exitDuelGame()
            .catch(() => null)
            .finally(() => duelExitGuardInFlightRef.current.delete(matchId));
          if (!exitedGame?.successful) {
            dispatch({
              type: 'SHOW_TOAST',
              message: 'Riot still marks the game reconnectable. Do not reconnect; the exit guard remains active.',
            });
          }
        });
        return;
      }

      if (snapshot.status === 'MATCHED' && owner && credentials && window.w3c) {
        runOnce(`${matchId}:create`, async () => {
          dispatch({ type: 'CREATION_STEP', step: 1 });
          const result = await window.w3c!.league.createCustomLobby({
            ...credentials,
            region: player.region,
            expectedPlayers: 2,
            ruleset: 'DUEL_ARAM',
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
            const teamBalance = await window.w3c!.league.balanceDuelTeams();
            if (!teamBalance.successful || teamBalance.status !== 'SUCCESS') {
              dispatch({
                type: 'SET_ERROR',
                message: `Pinkward could not place both players on opposite teams (${teamBalance.diagnosticCode}).`,
              });
              throw new Error(teamBalance.diagnosticCode);
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
    const lobby = { name: `PINKWARD-BOTS-${suffix}`, password: suffix };
    dispatch({ type: 'CREATION_STEP', step: 1 });
    void window.w3c.league.createBotLobby({
      ...lobby,
      region: state.player.region,
      expectedPlayers: 10,
      ruleset: 'BOT_TEST_5V5',
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
    async (gameName: string, tagLine: string, region: string) => {
      dispatch({ type: 'SET_ERROR', message: null });
      if (!stateRef.current.settings.demoMode) {
        try {
          const normalizedAddress = configureServerAddress(stateRef.current.serverAddress);
          localStorage.setItem('w3c.serverAddress', normalizedAddress);
          dispatch({ type: 'SET_SERVER_ADDRESS', address: normalizedAddress });
        } catch {
          dispatch({
            type: 'SET_ERROR',
            message: 'Enter a valid server address, for example play.pinkward.lol.',
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
              message: 'Start League and sign in before connecting to Pinkward.',
            });
            return;
          }
          dispatch({ type: 'SET_SERVER_STATUS', status: 'CONNECTING' });
          const authenticatedPlayer = await api.login({
            riotPuuid: leagueIdentity.riotPuuid,
            gameName: leagueIdentity.gameName,
            tagLine: leagueIdentity.tagLine,
            region: leagueIdentity.region,
          });
          player = {
            ...authenticatedPlayer,
            ...(leagueIdentity.profileIconDataUrl
              ? { profileIconDataUrl: leagueIdentity.profileIconDataUrl }
              : {}),
          };
          dispatch({ type: 'SET_SERVER_STATUS', status: 'CONNECTED' });
        }
        dispatch({
          type: 'LOGIN_SUCCESS',
          player,
          history: loadMatchHistory(player.id),
        });
        if (!stateRef.current.settings.demoMode) {
          const party = await api.getParty();
          dispatch({ type: 'SET_PARTY_CONTEXT', context: party });
          await refreshStats();
          await refreshChat();
        }
      } catch (error) {
        dispatch({ type: 'SET_SERVER_STATUS', status: 'DISCONNECTED' });
        dispatch({
          type: 'SET_ERROR',
          message: error instanceof ApiError && error.status === 401
            ? 'The League identity was rejected by the server.'
            : 'Unable to reach the Pinkward server. Enable demo mode to explore the full flow.',
        });
      }
    },
    [api, refreshChat, refreshStats],
  );

  const sendChatMessage = useCallback(async (content: string): Promise<boolean> => {
    const current = stateRef.current;
    const normalized = content.trim();
    if (!normalized || normalized.length > 500 || !current.player) return false;
    if (current.settings.demoMode) {
      dispatch({
        type: 'RECEIVE_CHAT_MESSAGE',
        message: {
          id: crypto.randomUUID(),
          authorId: current.player.id,
          gameName: current.player.gameName,
          tagLine: current.player.tagLine,
          content: normalized,
          sentAt: new Date().toISOString(),
        },
      });
      return true;
    }
    try {
      const message = await api.sendChatMessage(normalized);
      dispatch({ type: 'RECEIVE_CHAT_MESSAGE', message });
      return true;
    } catch (error) {
      dispatch({
        type: 'SHOW_TOAST',
        message: error instanceof ApiError && error.status === 429
          ? 'Please wait two seconds before sending again'
          : 'Your message could not be sent',
      });
      return false;
    }
  }, [api]);

  const navigate = useCallback((screen: 'HOME' | 'PLAY' | 'HISTORY' | 'CHAT' | 'SETTINGS') => {
    dispatch({ type: 'NAVIGATE', screen });
    if (screen === 'CHAT' && !stateRef.current.settings.demoMode) void refreshChat();
  }, [refreshChat]);

  const findMatch = useCallback(async () => {
    const current = stateRef.current;
    activeGameIdRef.current = null;
    inactiveGameflowPollsRef.current.clear();
    duelOperationsRef.current.clear();
    duelVictoryChecksInFlightRef.current.clear();
    reportedDuelVictoryRef.current.clear();
    dispatch({ type: 'SET_ERROR', message: null });
    if (!current.settings.demoMode && !current.localBotMatch) {
      try {
        if (current.settings.duelMode) {
          await api.joinDuelQueue({
            primaryRole: current.primaryRole,
            secondaryRole: current.secondaryRole,
          });
        } else {
          if (current.partyId) {
            await api.updatePartyRoles(current.primaryRole, current.secondaryRole);
          }
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

  const inviteToParty = useCallback(async (riotId: string): Promise<boolean> => {
    const current = stateRef.current;
    const normalized = riotId.trim();
    const separator = normalized.lastIndexOf('#');
    const gameName = separator > 0 ? normalized.slice(0, separator).trim() : '';
    const tagLine = separator > 0 ? normalized.slice(separator + 1).trim().toUpperCase() : '';

    if (!gameName || !tagLine || tagLine.includes('#')) {
      dispatch({ type: 'SHOW_TOAST', message: 'Use a complete Riot ID, for example Player#EUW' });
      return false;
    }
    if (current.partyMembers.length >= 4) {
      dispatch({ type: 'SHOW_TOAST', message: 'Your party is full — maximum 5 players' });
      return false;
    }

    const memberId = `${gameName}#${tagLine}`.toLocaleLowerCase();
    const currentRiotId = current.player
      ? `${current.player.gameName}#${current.player.tagLine}`.toLocaleLowerCase()
      : '';
    if (memberId === currentRiotId) {
      dispatch({ type: 'SHOW_TOAST', message: 'You are already the party leader' });
      return false;
    }
    if (current.partyMembers.some((member) => member.id === memberId)) {
      dispatch({ type: 'SHOW_TOAST', message: 'This player is already in your party' });
      return false;
    }

    if (current.settings.demoMode) {
      dispatch({ type: 'ADD_PARTY_MEMBER', member: { id: memberId, gameName, tagLine, status: 'INVITED' } });
    } else {
      try {
        const context = await api.inviteToParty(gameName, tagLine);
        dispatch({ type: 'SET_PARTY_CONTEXT', context });
      } catch (error) {
        dispatch({ type: 'SHOW_TOAST', message: error instanceof ApiError && error.status === 404
          ? 'Player not found. They must connect to Pinkward before you can invite them.'
          : 'The invitation could not be sent.' });
        return false;
      }
    }
    if (current.settings.duelMode) dispatch({ type: 'SET_SETTING', key: 'duelMode', value: false });
    dispatch({ type: 'SHOW_TOAST', message: `Invitation sent to ${gameName}#${tagLine}` });
    return true;
  }, [api]);

  const removePartyMember = useCallback(async (memberId: string) => {
    const current = stateRef.current;
    if (current.settings.demoMode) {
      dispatch({ type: 'REMOVE_PARTY_MEMBER', memberId });
    } else {
      try {
        const context = await api.removePartyMember(memberId);
        dispatch({ type: 'SET_PARTY_CONTEXT', context });
      } catch {
        dispatch({ type: 'SHOW_TOAST', message: 'This player could not be removed.' });
        return;
      }
    }
    dispatch({ type: 'SHOW_TOAST', message: 'Player removed from the party' });
  }, [api]);

  const acceptPartyInvitation = useCallback(async (invitationId: string) => {
    try {
      const context = await api.acceptPartyInvitation(invitationId);
      dispatch({ type: 'SET_PARTY_CONTEXT', context });
      dispatch({ type: 'SET_SETTING', key: 'duelMode', value: false });
      dispatch({ type: 'SHOW_TOAST', message: 'You joined the party' });
    } catch {
      dispatch({ type: 'SHOW_TOAST', message: 'This invitation is no longer available.' });
    }
  }, [api]);

  const declinePartyInvitation = useCallback(async (invitationId: string) => {
    try {
      const context = await api.declinePartyInvitation(invitationId);
      dispatch({ type: 'SET_PARTY_CONTEXT', context });
    } catch {
      dispatch({ type: 'SHOW_TOAST', message: 'This invitation is no longer available.' });
    }
  }, [api]);

  const leaveParty = useCallback(async () => {
    try {
      const context = await api.leaveParty();
      dispatch({ type: 'SET_PARTY_CONTEXT', context });
      dispatch({ type: 'SHOW_TOAST', message: 'You left the party' });
    } catch {
      dispatch({ type: 'SHOW_TOAST', message: 'You cannot leave the party while matchmaking.' });
    }
  }, [api]);

  const playAgain = useCallback(async () => {
    const current = stateRef.current;
    activeGameIdRef.current = null;
    inactiveGameflowPollsRef.current.clear();
    duelOperationsRef.current.clear();
    duelVictoryChecksInFlightRef.current.clear();
    reportedDuelVictoryRef.current.clear();
    dispatch({ type: 'SET_ERROR', message: null });
    if (!current.settings.demoMode) {
      try {
        if (current.settings.duelMode) {
          await api.joinDuelQueue({
            primaryRole: current.primaryRole,
            secondaryRole: current.secondaryRole,
          });
        } else {
          if (current.partyId) {
            await api.updatePartyRoles(current.primaryRole, current.secondaryRole);
          }
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

  const setMatchmakingMode = useCallback((mode: 'DUEL_1V1' | 'COMMUNITY_5V5') => {
    const current = stateRef.current;
    if (mode === 'DUEL_1V1' && current.partyMembers.length > 0) {
      dispatch({
        type: 'SHOW_TOAST',
        message: 'Leave your party before switching to 1v1 Showdown.',
      });
      return;
    }
    dispatch({ type: 'SET_SETTING', key: 'duelMode', value: mode === 'DUEL_1V1' });
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
    navigate,
    sendChatMessage,
    setPrimaryRole: (role) => dispatch({ type: 'SET_PRIMARY_ROLE', role }),
    setSecondaryRole: (role) => dispatch({ type: 'SET_SECONDARY_ROLE', role }),
    inviteToParty,
    removePartyMember,
    acceptPartyInvitation,
    declinePartyInvitation,
    leaveParty,
    findMatch,
    leaveQueue,
    acceptReadyCheck,
    declineReadyCheck,
    confirmManualLobbyCreated,
    playAgain,
    finishDemoGame,
    setMatchmakingMode,
    updateSetting,
    copyText,
    openLeague,
    chooseLeagueLocation,
    setServerAddress: (address) => dispatch({ type: 'SET_SERVER_ADDRESS', address }),
    clearToast: () => dispatch({ type: 'CLEAR_TOAST' }),
  };
}
