import { access, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { app, BrowserWindow, dialog, ipcMain, type OpenDialogOptions } from 'electron';
import electronUpdater from 'electron-updater';
import { LocalLeagueClientAdapter } from './league/LocalLeagueClientAdapter.js';
import type { BotLobbyConfiguration, CustomLobbyConfiguration, LobbyCredentials } from './league/types.js';

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const leagueAdapter = new LocalLeagueClientAdapter();

interface LeagueLocationPreference {
  installationDirectory?: unknown;
}

interface UpdateConfiguration {
  enabled?: unknown;
  url?: unknown;
}

function leaguePreferenceFile(): string {
  return path.join(app.getPath('userData'), 'league-location.json');
}

async function configureAutomaticUpdates(): Promise<void> {
  if (!app.isPackaged || process.env.PORTABLE_EXECUTABLE_FILE) return;
  try {
    const raw = await readFile(path.join(process.resourcesPath, 'update-config.json'), 'utf8');
    const configuration = JSON.parse(raw) as UpdateConfiguration;
    if (configuration.enabled !== true || typeof configuration.url !== 'string') return;
    const updateUrl = new URL(configuration.url);
    if (updateUrl.protocol !== 'https:') return;
    const { NsisUpdater } = electronUpdater;
    const updater = new NsisUpdater({ provider: 'generic', url: updateUrl.toString() });
    updater.autoDownload = true;
    updater.autoInstallOnAppQuit = true;
    await updater.checkForUpdatesAndNotify();
  } catch {
    // Update checks must never prevent the companion from starting.
  }
}

async function validLeagueDirectory(selectedDirectory: string): Promise<string | null> {
  const candidates = [
    path.resolve(selectedDirectory),
    path.resolve(selectedDirectory, 'League of Legends'),
  ];
  for (const candidate of candidates) {
    try {
      await access(path.join(candidate, 'LeagueClient.exe'));
      return candidate;
    } catch {
      // The picker may point either at the game directory or at its parent.
    }
  }
  return null;
}

async function loadLeagueLocation(): Promise<void> {
  try {
    const raw = await readFile(leaguePreferenceFile(), 'utf8');
    const preference = JSON.parse(raw) as LeagueLocationPreference;
    if (typeof preference.installationDirectory !== 'string') return;
    const directory = await validLeagueDirectory(preference.installationDirectory);
    if (directory) leagueAdapter.setInstallationDirectory(directory);
  } catch {
    // Missing, invalid, or stale preference: automatic discovery remains available.
  }
}

async function saveLeagueLocation(directory: string): Promise<void> {
  await writeFile(
    leaguePreferenceFile(),
    JSON.stringify({ installationDirectory: directory }, null, 2),
    { encoding: 'utf8', mode: 0o600 },
  );
}

function createWindow(): void {
  const window = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1080,
    minHeight: 720,
    backgroundColor: '#070b10',
    title: 'Pinkward',
    frame: false,
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      // Sandboxed preload scripts run as CommonJS in Electron. TypeScript emits
      // preload.cts as preload.cjs so the bridge is actually available in the
      // packaged application.
      preload: path.join(currentDir, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  window.once('ready-to-show', () => window.show());

  const devServerUrl = process.env.VITE_DEV_SERVER_URL;
  if (devServerUrl) {
    void window.loadURL(devServerUrl);
  } else {
    void window.loadFile(path.join(currentDir, '..', 'dist', 'index.html'));
  }
}

function registerIpc(): void {
  ipcMain.on('window:minimize', (event) => BrowserWindow.fromWebContents(event.sender)?.minimize());
  ipcMain.on('window:toggle-maximize', (event) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    if (!window) return;
    if (window.isMaximized()) window.unmaximize();
    else window.maximize();
  });
  ipcMain.on('window:close', (event) => BrowserWindow.fromWebContents(event.sender)?.close());
  ipcMain.handle('league:get-installation-path', () => leagueAdapter.getInstallationDirectory());
  ipcMain.handle('league:select-installation-path', async () => {
    const focusedWindow = BrowserWindow.getFocusedWindow();
    const options: OpenDialogOptions = {
      title: 'Select the League of Legends installation folder',
      defaultPath: leagueAdapter.getInstallationDirectory() ?? 'C:\\Riot Games\\League of Legends',
      properties: ['openDirectory'],
    };
    const result = focusedWindow
      ? await dialog.showOpenDialog(focusedWindow, options)
      : await dialog.showOpenDialog(options);
    if (result.canceled || !result.filePaths[0]) {
      return { path: leagueAdapter.getInstallationDirectory(), selected: false };
    }
    const directory = await validLeagueDirectory(result.filePaths[0]);
    if (!directory) {
      return {
        path: leagueAdapter.getInstallationDirectory(),
        selected: false,
        error: 'The selected folder does not contain LeagueClient.exe.',
      };
    }
    leagueAdapter.setInstallationDirectory(directory);
    await saveLeagueLocation(directory);
    return { path: directory, selected: true };
  });
  ipcMain.handle('league:get-status', () => leagueAdapter.getStatus());
  ipcMain.handle('league:get-identity', () => leagueAdapter.getIdentity());
  ipcMain.handle('league:get-game-result', (_event, gameId: number) =>
    leagueAdapter.getGameResult(gameId),
  );
  ipcMain.handle('league:create-custom-lobby', (_event, config: CustomLobbyConfiguration) =>
    leagueAdapter.createCustomLobby(config),
  );
  ipcMain.handle('league:create-bot-lobby', (_event, config: BotLobbyConfiguration) =>
    leagueAdapter.createBotLobby(config),
  );
  ipcMain.handle('league:join-custom-lobby', (_event, credentials: LobbyCredentials) =>
    leagueAdapter.joinCustomLobby(credentials),
  );
  ipcMain.handle('league:start-game', () => leagueAdapter.startGame());
  ipcMain.handle('league:start-duel-game', () => leagueAdapter.startDuelGame());
  ipcMain.handle('league:start-bot-game', () => leagueAdapter.startBotGame());
  ipcMain.handle('league:set-position-preferences', (_event, primaryRole, secondaryRole) =>
    leagueAdapter.setPositionPreferences(primaryRole, secondaryRole),
  );
  ipcMain.handle('league:open', () => leagueAdapter.openLeague());
}

app.whenReady().then(async () => {
  await loadLeagueLocation();
  registerIpc();
  createWindow();
  void configureAutomaticUpdates();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
