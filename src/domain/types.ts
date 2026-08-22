export const ROLES = ['TOP', 'JUNGLE', 'MID', 'ADC', 'SUPPORT'] as const;
export type Role = (typeof ROLES)[number];

export type AppScreen =
  | 'LOGIN'
  | 'HOME'
  | 'PLAY'
  | 'SEARCHING'
  | 'READY_CHECK'
  | 'CREATING_MATCH'
  | 'JOINING_LOBBY'
  | 'MATCH_OVERVIEW'
  | 'POST_GAME'
  | 'HISTORY'
  | 'CHAT'
  | 'SETTINGS';

export type ServerStatus = 'CONNECTING' | 'CONNECTED' | 'DISCONNECTED' | 'SIMULATION';
export type LeagueClientState =
  | 'NOT_INSTALLED'
  | 'NOT_RUNNING'
  | 'STARTING'
  | 'CONNECTED'
  | 'LOBBY'
  | 'CHAMP_SELECT'
  | 'IN_GAME'
  | 'UNKNOWN';

export type MatchLifecycle =
  | 'MATCH_READY'
  | 'LOBBY_OWNER_SELECTED'
  | 'LOBBY_CREATING'
  | 'LOBBY_READY'
  | 'PLAYERS_JOINING'
  | 'LOBBY_FULL'
  | 'LOBBY_VALIDATING'
  | 'LOBBY_VALID'
  | 'STARTING'
  | 'CHAMP_SELECT'
  | 'IN_GAME'
  | 'DUEL_ENDING'
  | 'POST_GAME'
  | 'FINISHED';

export interface PlayerIdentity {
  id: string;
  gameName: string;
  tagLine: string;
  region: string;
  profileIconDataUrl?: string;
}

export interface PartyMember {
  id: string;
  gameName: string;
  tagLine: string;
  status: 'INVITED' | 'JOINED';
  leader?: boolean;
  primaryRole?: Role | null;
  secondaryRole?: Role | null;
}

export interface PartyInvitation {
  id: string;
  partyId: string;
  leaderId: string;
  gameName: string;
  tagLine: string;
  createdAt: string;
}

export interface PartyContext {
  partyId: string | null;
  leaderId: string | null;
  members: Array<{
    playerId: string;
    gameName: string;
    tagLine: string;
    leader: boolean;
    joined: boolean;
    primaryRole: Role | null;
    secondaryRole: Role | null;
  }>;
  invitations: PartyInvitation[];
}

export interface LeagueStatus {
  installed: boolean;
  running: boolean;
  state: LeagueClientState;
  adapterHealthy: boolean;
  automationAvailable: boolean;
  observedAt: string;
  detail: string;
  gameId?: number;
}

export interface LeagueGameResult {
  gameId: number;
  outcome: 'BLUE_WIN' | 'RED_WIN' | 'UNKNOWN';
  diagnosticCode: string;
  durationSeconds?: number;
  score?: string;
}

export interface LeagueDuelFirstBlood {
  eventId: number;
  eventTimeSeconds: number;
  killerName: string;
  victimName: string;
  localPlayerWon: boolean;
}

export interface LeagueIdentity {
  riotPuuid: string;
  gameName: string;
  tagLine: string;
  region: string;
  profileIconId?: number;
  profileIconDataUrl?: string;
}

export interface LobbyCredentials {
  name: string;
  password: string;
  partyId?: string;
}

export interface MatchParticipant {
  id: string;
  gameName: string;
  tagLine: string;
  team: 'BLUE' | 'RED';
  role: Role;
  joined: boolean;
  isCurrentPlayer?: boolean;
}

export type DuelStatus =
  | 'WAITING'
  | 'MATCHED'
  | 'LOBBY_READY'
  | 'BOTH_JOINED'
  | 'STARTED'
  | 'FINISHED'
  | 'CANCELLED';

export interface DuelSnapshot {
  matchId: string | null;
  status: DuelStatus;
  ownerId: string | null;
  credentials: { lobbyName: string; password: string } | null;
  partyId: string | null;
  result: {
    outcome: 'BLUE_WIN' | 'RED_WIN' | 'UNKNOWN';
    durationSeconds: number | null;
    score: string | null;
    completedAt: string;
  } | null;
  participants: MatchParticipant[];
}

export interface MatchSummary {
  id: string;
  playedAt: string;
  result: 'WIN' | 'LOSS' | 'UNKNOWN';
  role: Role;
  durationSeconds: number;
  score: string;
}

export interface RoleStats {
  role: Role;
  gamesPlayed: number;
  wins: number;
  losses: number;
  winRate: number;
}

export interface PlayerStats {
  gamesPlayed: number;
  wins: number;
  losses: number;
  unresolved: number;
  winRate: number;
  averageDurationSeconds: number;
  currentWinStreak: number;
  favoriteRole: Role | null;
  roles: RoleStats[];
  matches: MatchSummary[];
}

export interface ChatMessage {
  id: string;
  authorId: string;
  gameName: string;
  tagLine: string;
  content: string;
  sentAt: string;
}

export interface AppSettings {
  duelMode: boolean;
  demoMode: boolean;
  desktopNotifications: boolean;
  sounds: boolean;
  launchLeagueOnLobby: boolean;
}

export interface AppState {
  screen: AppScreen;
  player: PlayerIdentity | null;
  partyId: string | null;
  partyLeaderId: string | null;
  partyMembers: PartyMember[];
  partyInvitations: PartyInvitation[];
  primaryRole: Role;
  secondaryRole: Role;
  serverStatus: ServerStatus;
  league: LeagueStatus;
  leagueInstallationPath: string | null;
  serverAddress: string;
  playersSearching: number;
  estimatedWaitSeconds: number;
  queueElapsedSeconds: number;
  readyCheckId: string | null;
  readySecondsLeft: number;
  acceptedCount: number;
  acceptedByMe: boolean;
  creationStep: number;
  lobby: LobbyCredentials | null;
  manualCreate: { commandId: string; matchId: string; confirmed: boolean } | null;
  participants: MatchParticipant[];
  joinedCount: number;
  lifecycle: MatchLifecycle | null;
  currentMatchId: string | null;
  localBotMatch: boolean;
  duelMatch: boolean;
  duelOwner: boolean;
  inGameElapsedSeconds: number;
  lastResult: MatchSummary | null;
  history: MatchSummary[];
  stats: PlayerStats | null;
  chatMessages: ChatMessage[];
  unreadChatMessages: number;
  settings: AppSettings;
  toast: string | null;
  error: string | null;
}

export type AppAction =
  | { type: 'LOGIN_SUCCESS'; player: PlayerIdentity; history: MatchSummary[] }
  | { type: 'LOGOUT' }
  | { type: 'NAVIGATE'; screen: 'HOME' | 'PLAY' | 'HISTORY' | 'CHAT' | 'SETTINGS' }
  | { type: 'ADD_PARTY_MEMBER'; member: PartyMember }
  | { type: 'REMOVE_PARTY_MEMBER'; memberId: string }
  | { type: 'SET_PARTY_CONTEXT'; context: PartyContext }
  | { type: 'RECEIVE_PARTY_INVITATION'; invitation: PartyInvitation }
  | { type: 'SET_PRIMARY_ROLE'; role: Role }
  | { type: 'SET_SECONDARY_ROLE'; role: Role }
  | { type: 'SET_SERVER_STATUS'; status: ServerStatus }
  | { type: 'SET_LEAGUE_STATUS'; status: LeagueStatus }
  | { type: 'SET_LEAGUE_INSTALLATION_PATH'; path: string | null }
  | { type: 'SET_SERVER_ADDRESS'; address: string }
  | { type: 'FIND_MATCH' }
  | { type: 'LOCAL_BOT_MATCH_FOUND'; readyCheckId: string }
  | { type: 'QUEUE_TICK'; playersSearching?: number }
  | { type: 'LEAVE_QUEUE' }
  | { type: 'MATCH_FOUND'; readyCheckId: string }
  | { type: 'ACCEPT_READY_CHECK' }
  | { type: 'READY_TICK' }
  | { type: 'READY_PROGRESS'; acceptedCount: number }
  | { type: 'READY_COMPLETE'; matchId: string; participants: MatchParticipant[] }
  | {
      type: 'DUEL_MATCHED';
      matchId: string;
      participants: MatchParticipant[];
      owner: boolean;
    }
  | { type: 'CREATION_STEP'; step: number }
  | {
      type: 'MANUAL_CREATE_REQUIRED';
      commandId: string;
      matchId: string;
      lobby: LobbyCredentials;
    }
  | { type: 'MANUAL_CREATE_CONFIRMED' }
  | { type: 'JOINING_STARTED'; lobby: LobbyCredentials }
  | { type: 'PLAYER_JOINED'; playerId: string }
  | { type: 'SET_LIFECYCLE'; lifecycle: MatchLifecycle }
  | { type: 'GAME_TICK' }
  | { type: 'GAME_ENDED'; result: MatchSummary }
  | { type: 'SET_STATS'; stats: PlayerStats }
  | { type: 'SET_CHAT_MESSAGES'; messages: ChatMessage[] }
  | { type: 'RECEIVE_CHAT_MESSAGE'; message: ChatMessage }
  | { type: 'PLAY_AGAIN' }
  | { type: 'SET_SETTING'; key: keyof AppSettings; value: boolean }
  | { type: 'SHOW_TOAST'; message: string }
  | { type: 'CLEAR_TOAST' }
  | { type: 'SET_ERROR'; message: string | null };
