import { contextBridge, ipcRenderer } from 'electron';

interface LobbyCredentials {
  name: string;
  password: string;
  partyId?: string;
}

interface CustomLobbyConfiguration extends LobbyCredentials {
  region: string;
  expectedPlayers: number;
  ruleset: 'DUEL_ARAM' | 'TOURNAMENT_DRAFT_5V5' | 'BOT_TEST_5V5';
}

interface BotLobbyConfiguration extends CustomLobbyConfiguration {
  playerRole: 'TOP' | 'JUNGLE' | 'MID' | 'ADC' | 'SUPPORT';
  secondaryRole: 'TOP' | 'JUNGLE' | 'MID' | 'ADC' | 'SUPPORT';
}

interface UpdateSnapshot {
  status: 'UNAVAILABLE' | 'IDLE' | 'CHECKING' | 'UP_TO_DATE' | 'DOWNLOADING' | 'READY' | 'ERROR';
  currentVersion: string;
  availableVersion?: string;
  progressPercent?: number;
  message: string;
}

const leagueBridge = {
  getInstallationPath: () => ipcRenderer.invoke('league:get-installation-path'),
  selectInstallationPath: () => ipcRenderer.invoke('league:select-installation-path'),
  getStatus: () => ipcRenderer.invoke('league:get-status'),
  getIdentity: () => ipcRenderer.invoke('league:get-identity'),
  getGameResult: (gameId: number) => ipcRenderer.invoke('league:get-game-result', gameId),
  getDuelVictory: () => ipcRenderer.invoke('league:get-duel-victory'),
  createCustomLobby: (configuration: CustomLobbyConfiguration) =>
    ipcRenderer.invoke('league:create-custom-lobby', configuration),
  createBotLobby: (configuration: BotLobbyConfiguration) =>
    ipcRenderer.invoke('league:create-bot-lobby', configuration),
  joinCustomLobby: (credentials: LobbyCredentials) =>
    ipcRenderer.invoke('league:join-custom-lobby', credentials),
  balanceDuelTeams: () => ipcRenderer.invoke('league:balance-duel-teams'),
  startGame: () => ipcRenderer.invoke('league:start-game'),
  startDuelGame: () => ipcRenderer.invoke('league:start-duel-game'),
  startBotGame: () => ipcRenderer.invoke('league:start-bot-game'),
  setPositionPreferences: (
    primaryRole: BotLobbyConfiguration['playerRole'],
    secondaryRole: BotLobbyConfiguration['secondaryRole'],
  ) => ipcRenderer.invoke('league:set-position-preferences', primaryRole, secondaryRole),
  openLeague: () => ipcRenderer.invoke('league:open'),
};

const updaterBridge = {
  getStatus: (): Promise<UpdateSnapshot> => ipcRenderer.invoke('updater:get-status'),
  check: (): Promise<UpdateSnapshot> => ipcRenderer.invoke('updater:check'),
  install: (): Promise<boolean> => ipcRenderer.invoke('updater:install'),
  onStatus: (listener: (snapshot: UpdateSnapshot) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, snapshot: UpdateSnapshot) => listener(snapshot);
    ipcRenderer.on('updater:status', handler);
    return () => ipcRenderer.removeListener('updater:status', handler);
  },
};

contextBridge.exposeInMainWorld('w3c', {
  league: leagueBridge,
  updater: updaterBridge,
  platform: process.platform,
  window: {
    minimize: () => ipcRenderer.send('window:minimize'),
    toggleMaximize: () => ipcRenderer.send('window:toggle-maximize'),
    close: () => ipcRenderer.send('window:close'),
  },
});
