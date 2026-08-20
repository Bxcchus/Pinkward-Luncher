import { contextBridge, ipcRenderer } from 'electron';

interface LobbyCredentials {
  name: string;
  password: string;
  partyId?: string;
}

interface CustomLobbyConfiguration extends LobbyCredentials {
  region: string;
  map?: string;
  expectedPlayers: number;
}

interface BotLobbyConfiguration extends CustomLobbyConfiguration {
  playerRole: 'TOP' | 'JUNGLE' | 'MID' | 'ADC' | 'SUPPORT';
  secondaryRole: 'TOP' | 'JUNGLE' | 'MID' | 'ADC' | 'SUPPORT';
}

const leagueBridge = {
  getInstallationPath: () => ipcRenderer.invoke('league:get-installation-path'),
  selectInstallationPath: () => ipcRenderer.invoke('league:select-installation-path'),
  getStatus: () => ipcRenderer.invoke('league:get-status'),
  getIdentity: () => ipcRenderer.invoke('league:get-identity'),
  getGameResult: (gameId: number) => ipcRenderer.invoke('league:get-game-result', gameId),
  createCustomLobby: (configuration: CustomLobbyConfiguration) =>
    ipcRenderer.invoke('league:create-custom-lobby', configuration),
  createBotLobby: (configuration: BotLobbyConfiguration) =>
    ipcRenderer.invoke('league:create-bot-lobby', configuration),
  joinCustomLobby: (credentials: LobbyCredentials) =>
    ipcRenderer.invoke('league:join-custom-lobby', credentials),
  startGame: () => ipcRenderer.invoke('league:start-game'),
  startDuelGame: () => ipcRenderer.invoke('league:start-duel-game'),
  startBotGame: () => ipcRenderer.invoke('league:start-bot-game'),
  setPositionPreferences: (
    primaryRole: BotLobbyConfiguration['playerRole'],
    secondaryRole: BotLobbyConfiguration['secondaryRole'],
  ) => ipcRenderer.invoke('league:set-position-preferences', primaryRole, secondaryRole),
  openLeague: () => ipcRenderer.invoke('league:open'),
};

contextBridge.exposeInMainWorld('w3c', {
  auth: {
    getAccessCode: () => ipcRenderer.invoke('auth:get-access-code'),
    saveAccessCode: (accessCode: string) => ipcRenderer.invoke('auth:save-access-code', accessCode),
  },
  league: leagueBridge,
  platform: process.platform,
});
