import { access, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { app, BrowserWindow, dialog, ipcMain, type OpenDialogOptions } from 'electron';
import electronUpdater from 'electron-updater';
import { LcuEventClient, type LeagueGameflowEvent } from './league/LcuEventClient.js';
import { LcuHttpClient } from './league/LcuHttpClient.js';
import { LocalLeagueClientAdapter } from './league/LocalLeagueClientAdapter.js';
import type { BotLobbyConfiguration, CustomLobbyConfiguration, LobbyCredentials } from './league/types.js';

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const leagueAdapter = new LocalLeagueClientAdapter();
const leagueEventClient = new LcuEventClient(
  (event) => publishLeagueEvent(event),
  async () =>
    (await LcuHttpClient.connect(leagueAdapter.getInstallationDirectory())).webSocketConnection(),
);

interface LeagueLocationPreference {
  installationDirectory?: unknown;
}

interface UpdateConfiguration {
  enabled?: unknown;
  url?: unknown;
}

type UpdateStatus =
  | 'UNAVAILABLE'
  | 'IDLE'
  | 'CHECKING'
  | 'UP_TO_DATE'
  | 'AVAILABLE'
  | 'DOWNLOADING'
  | 'READY'
  | 'ERROR';

interface UpdateSnapshot {
  status: UpdateStatus;
  currentVersion: string;
  availableVersion?: string;
  progressPercent?: number;
  message: string;
}

const UPDATE_CHECK_INTERVAL_MS = 5 * 60 * 1_000;
let applicationUpdater: InstanceType<typeof electronUpdater.NsisUpdater> | null = null;
let updateCheckTimer: NodeJS.Timeout | null = null;
let updateSnapshot: UpdateSnapshot = {
  status: 'UNAVAILABLE',
  currentVersion: '0.0.0',
  message: 'Updates are available in the installed Windows edition.',
};

function publishLeagueEvent(event: LeagueGameflowEvent): void {
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send('league:gameflow-event', event);
  }
}

function leaguePreferenceFile(): string {
  return path.join(app.getPath('userData'), 'league-location.json');
}

function publishUpdateSnapshot(snapshot: UpdateSnapshot): UpdateSnapshot {
  updateSnapshot = snapshot;
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send('updater:status', snapshot);
  }
  return snapshot;
}

function updateStatus(
  status: UpdateStatus,
  message: string,
  details: Pick<UpdateSnapshot, 'availableVersion' | 'progressPercent'> = {},
): UpdateSnapshot {
  return publishUpdateSnapshot({
    status,
    currentVersion: app.getVersion(),
    ...details,
    message,
  });
}

async function configureAutomaticUpdates(): Promise<void> {
  if (!app.isPackaged) {
    updateStatus('UNAVAILABLE', 'Updates are available in the installed Windows edition.');
    return;
  }
  if (process.env.PORTABLE_EXECUTABLE_FILE) {
    updateStatus('UNAVAILABLE', 'Automatic updates require the installed Pinkward edition.');
    return;
  }
  try {
    const raw = await readFile(path.join(process.resourcesPath, 'update-config.json'), 'utf8');
    const configuration = JSON.parse(raw) as UpdateConfiguration;
    if (configuration.enabled !== true || typeof configuration.url !== 'string') {
      updateStatus('UNAVAILABLE', 'Updates are disabled for this Pinkward build.');
      return;
    }
    const updateUrl = new URL(configuration.url);
    if (updateUrl.protocol !== 'https:') {
      updateStatus('ERROR', 'The configured update service is invalid.');
      return;
    }
    const { NsisUpdater } = electronUpdater;
    const updater = new NsisUpdater({ provider: 'generic', url: updateUrl.toString() });
    applicationUpdater = updater;
    updater.autoDownload = false;
    updater.autoInstallOnAppQuit = false;
    updater.on('checking-for-update', () => {
      updateStatus('CHECKING', 'Checking GitHub for a newer Pinkward release…');
    });
    updater.on('update-available', (info) => {
      updateStatus('AVAILABLE', `Pinkward ${info.version} is available.`, {
        availableVersion: info.version,
      });
    });
    updater.on('update-not-available', (info) => {
      updateStatus('UP_TO_DATE', 'Pinkward is up to date.', { availableVersion: info.version });
    });
    updater.on('download-progress', (progress) => {
      updateStatus('DOWNLOADING', `Downloading update · ${Math.round(progress.percent)}%`, {
        availableVersion: updateSnapshot.availableVersion,
        progressPercent: Math.max(0, Math.min(100, progress.percent)),
      });
    });
    updater.on('update-downloaded', (info) => {
      updateStatus('READY', `Pinkward ${info.version} is ready to install.`, {
        availableVersion: info.version,
        progressPercent: 100,
      });
    });
    updater.on('error', () => {
      updateStatus('ERROR', 'Unable to retrieve the latest Pinkward release from GitHub.', {
        availableVersion: updateSnapshot.availableVersion,
      });
    });
    updateStatus('IDLE', 'Check GitHub for the latest Pinkward release.');
  } catch {
    applicationUpdater = null;
    updateStatus('ERROR', 'Unable to configure Pinkward updates.');
  }
}

async function downloadApplicationUpdate(): Promise<UpdateSnapshot> {
  const retryingKnownUpdate =
    updateSnapshot.status === 'ERROR' && Boolean(updateSnapshot.availableVersion);
  if (
    !applicationUpdater ||
    (updateSnapshot.status !== 'AVAILABLE' && !retryingKnownUpdate)
  ) return updateSnapshot;
  const availableVersion = updateSnapshot.availableVersion;
  updateStatus('DOWNLOADING', `Downloading Pinkward ${availableVersion ?? 'update'}…`, {
    availableVersion,
    progressPercent: 0,
  });
  try {
    await applicationUpdater.downloadUpdate();
  } catch {
    updateStatus('ERROR', 'The Pinkward update could not be downloaded. Please retry.', {
      availableVersion,
    });
  }
  return updateSnapshot;
}

async function checkForApplicationUpdates(): Promise<UpdateSnapshot> {
  if (!applicationUpdater) return updateSnapshot;
  if (
    updateSnapshot.status === 'CHECKING' ||
    updateSnapshot.status === 'AVAILABLE' ||
    updateSnapshot.status === 'DOWNLOADING' ||
    updateSnapshot.status === 'READY'
  ) {
    return updateSnapshot;
  }
  try {
    await applicationUpdater.checkForUpdates();
  } catch {
    updateStatus('ERROR', 'Unable to retrieve the latest Pinkward release from GitHub.');
  }
  return updateSnapshot;
}

function startPeriodicUpdateChecks(): void {
  if (!applicationUpdater || updateCheckTimer) return;
  updateCheckTimer = setInterval(() => {
    void checkForApplicationUpdates();
  }, UPDATE_CHECK_INTERVAL_MS);
  updateCheckTimer.unref();
}

function stopPeriodicUpdateChecks(): void {
  if (!updateCheckTimer) return;
  clearInterval(updateCheckTimer);
  updateCheckTimer = null;
}

function installApplicationUpdate(): boolean {
  if (!applicationUpdater || updateSnapshot.status !== 'READY') return false;
  setImmediate(() => applicationUpdater?.quitAndInstall(false, true));
  return true;
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
  const iconPath = app.isPackaged
    ? path.join(process.resourcesPath, 'pinkward-logo.png')
    : path.join(currentDir, '..', 'src', 'assets', 'pinkward-logo-final.png');

  const window = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1080,
    minHeight: 720,
    backgroundColor: '#070b10',
    title: 'Pinkward',
    icon: iconPath,
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
    leagueEventClient.restart();
    return { path: directory, selected: true };
  });
  ipcMain.handle('league:get-status', () => leagueAdapter.getStatus());
  ipcMain.handle('league:get-identity', () => leagueAdapter.getIdentity());
  ipcMain.handle('league:get-game-result', (_event, gameId: number) =>
    leagueAdapter.getGameResult(gameId),
  );
  ipcMain.handle('league:get-duel-victory', () => leagueAdapter.getDuelVictory());
  ipcMain.handle('league:create-custom-lobby', (_event, config: CustomLobbyConfiguration) =>
    leagueAdapter.createCustomLobby(config),
  );
  ipcMain.handle('league:create-bot-lobby', (_event, config: BotLobbyConfiguration) =>
    leagueAdapter.createBotLobby(config),
  );
  ipcMain.handle('league:join-custom-lobby', (_event, credentials: LobbyCredentials) =>
    leagueAdapter.joinCustomLobby(credentials),
  );
  ipcMain.handle('league:balance-duel-teams', () => leagueAdapter.balanceDuelTeams());
  ipcMain.handle('league:start-game', () => leagueAdapter.startGame());
  ipcMain.handle('league:start-duel-game', () => leagueAdapter.startDuelGame());
  ipcMain.handle('league:start-bot-game', () => leagueAdapter.startBotGame());
  ipcMain.handle('league:set-position-preferences', (_event, primaryRole, secondaryRole) =>
    leagueAdapter.setPositionPreferences(primaryRole, secondaryRole),
  );
  ipcMain.handle('league:open', () => leagueAdapter.openLeague());
  ipcMain.handle('updater:get-status', () => updateSnapshot);
  ipcMain.handle('updater:check', () => checkForApplicationUpdates());
  ipcMain.handle('updater:download', () => downloadApplicationUpdate());
  ipcMain.handle('updater:install', () => installApplicationUpdate());
}

app.whenReady().then(async () => {
  await loadLeagueLocation();
  await configureAutomaticUpdates();
  registerIpc();
  createWindow();
  leagueEventClient.start();
  void checkForApplicationUpdates();
  startPeriodicUpdateChecks();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('before-quit', () => {
  stopPeriodicUpdateChecks();
  leagueEventClient.stop();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
