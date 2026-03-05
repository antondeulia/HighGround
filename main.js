const { app, BrowserWindow, Menu, Tray, dialog, ipcMain } = require('electron');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
let waitOn = null;
const http = require('http');
const next = require('next');
let autoUpdater = null;

try {
  ({ autoUpdater } = require('electron-updater'));
} catch {
  autoUpdater = null;
}

const NEXT_PORT = Number(process.env.ELECTRON_NEXT_PORT || 3310);
const APP_URL = `http://localhost:${NEXT_PORT}`;
const isDev = !app.isPackaged;
let nextProcess = null;
let nextServer = null;
let nextApp = null;
let mainWindow = null;
let tray = null;
let isQuitting = false;
const instanceProcesses = new Map();
const pluginProcesses = new Map();
const updaterState = {
  status: 'idle',
  currentVersion: app.getVersion(),
  availableVersion: null,
  downloadPercent: null,
  error: null
};

const PLUGIN_REGISTRY = {
  'codex-auto-submit': {
    id: 'codex-auto-submit',
    title: 'Codex Auto-Submit',
    scriptPath: path.join(__dirname, 'src', 'plugins', 'CodexAutoSubmit.js')
  }
};

const STARTUP_SETTINGS_FILE = 'startup-settings.json';
const DEFAULT_STARTUP_SETTINGS = {
  appStartWithWindows: false,
  pluginStartWithWindows: {}
};

function getStartupSettingsPath() {
  return path.join(app.getPath('userData'), STARTUP_SETTINGS_FILE);
}

function sanitizeStartupSettings(raw) {
  if (!raw || typeof raw !== 'object') {
    return {
      ...DEFAULT_STARTUP_SETTINGS,
      pluginStartWithWindows: {}
    };
  }

  const pluginStartWithWindows = {};
  if (raw.pluginStartWithWindows && typeof raw.pluginStartWithWindows === 'object') {
    for (const [pluginId, enabled] of Object.entries(raw.pluginStartWithWindows)) {
      if (typeof enabled === 'boolean') {
        pluginStartWithWindows[pluginId] = enabled;
      }
    }
  }

  return {
    appStartWithWindows:
      typeof raw.appStartWithWindows === 'boolean'
        ? raw.appStartWithWindows
        : DEFAULT_STARTUP_SETTINGS.appStartWithWindows,
    pluginStartWithWindows
  };
}

function readStartupSettings() {
  try {
    const raw = fs.readFileSync(getStartupSettingsPath(), 'utf8');
    return sanitizeStartupSettings(JSON.parse(raw));
  } catch {
    return {
      ...DEFAULT_STARTUP_SETTINGS,
      pluginStartWithWindows: {}
    };
  }
}

function writeStartupSettings(settings) {
  const sanitized = sanitizeStartupSettings(settings);
  const targetPath = getStartupSettingsPath();
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.writeFileSync(targetPath, JSON.stringify(sanitized, null, 2), 'utf8');
  return sanitized;
}

function setAppLoginStartup(enabled) {
  if (process.platform !== 'win32') return;
  app.setLoginItemSettings({
    openAtLogin: Boolean(enabled)
  });
}

function resolveGitBashPath() {
  const candidates = [
    path.join(process.env.ProgramFiles || 'C:\\Program Files', 'Git', 'git-bash.exe'),
    path.join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'Git', 'git-bash.exe')
  ];

  return candidates.find((candidate) => fs.existsSync(candidate)) || null;
}

function buildGitBashLaunch(instancePath, command) {
  const gitBashPath = resolveGitBashPath();
  if (!gitBashPath) {
    return { ok: false, error: 'Git Bash not found. Install Git for Windows.' };
  }

  if (!command) {
    return { ok: true, file: gitBashPath, args: [`--cd=${instancePath}`] };
  }

  return {
    ok: true,
    file: gitBashPath,
    args: [`--cd=${instancePath}`, '-lc', `${command}; exec bash`]
  };
}

function buildTerminalLaunch(instancePath, terminal = 'git-bash') {
  if (terminal === 'powershell') {
    return {
      ok: true,
      file: 'powershell.exe',
      args: ['-NoExit', '-Command', `Set-Location -LiteralPath '${instancePath.replace(/'/g, "''")}'`]
    };
  }

  if (terminal === 'cmd') {
    return {
      ok: true,
      file: 'cmd.exe',
      args: ['/K', `cd /d "${instancePath}"`]
    };
  }

  return buildGitBashLaunch(instancePath, '');
}

function resolveEditorCommand(ide = 'vscode') {
  if (ide === 'cursor') return 'cursor';
  return 'code';
}

function stopInstanceProcess(instanceId) {
  const entry = instanceProcesses.get(instanceId);
  if (!entry || !entry.process || entry.process.killed) {
    instanceProcesses.delete(instanceId);
    return false;
  }

  const proc = entry.process;

  if (process.platform === 'win32') {
    spawn('taskkill', ['/pid', String(proc.pid), '/t', '/f'], { shell: true });
  } else {
    proc.kill('SIGTERM');
  }

  instanceProcesses.delete(instanceId);
  return true;
}

function sendPluginLog(pluginId, line) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send('plugin:log', {
    pluginId,
    timestamp: new Date().toISOString(),
    line
  });
}

function streamPluginOutput(pluginId, stream) {
  let buffer = '';

  stream.on('data', (chunk) => {
    buffer += chunk.toString();
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() || '';
    for (const line of lines) {
      const trimmed = line.trimEnd();
      if (trimmed.length > 0) {
        sendPluginLog(pluginId, trimmed);
      }
    }
  });

  stream.on('end', () => {
    const last = buffer.trimEnd();
    if (last.length > 0) {
      sendPluginLog(pluginId, last);
    }
  });
}

function stopPluginProcess(pluginId) {
  const entry = pluginProcesses.get(pluginId);
  if (!entry || !entry.process || entry.process.killed) {
    pluginProcesses.delete(pluginId);
    return false;
  }

  entry.stopping = true;
  const proc = entry.process;

  if (process.platform === 'win32') {
    spawn('taskkill', ['/pid', String(proc.pid), '/t', '/f'], { shell: true });
  } else {
    proc.kill('SIGTERM');
  }

  return true;
}

async function startPluginProcess(pluginId) {
  if (!pluginId || typeof pluginId !== 'string') {
    return { ok: false, error: 'Invalid plugin id.' };
  }

  const plugin = PLUGIN_REGISTRY[pluginId];
  if (!plugin) {
    return { ok: false, error: `Unknown plugin: ${pluginId}` };
  }

  const existing = pluginProcesses.get(pluginId);
  if (existing && existing.process && !existing.process.killed) {
    return { ok: true, status: 'running' };
  }

  const packagedScriptPath = path.join(
    process.resourcesPath,
    'app.asar.unpacked',
    'src',
    'plugins',
    path.basename(plugin.scriptPath)
  );
  const scriptPath = app.isPackaged && fs.existsSync(packagedScriptPath)
    ? packagedScriptPath
    : plugin.scriptPath;

  if (!fs.existsSync(scriptPath)) {
    return { ok: false, error: `Plugin script not found: ${scriptPath}` };
  }

  try {
    const pluginNodePath = app.isPackaged
      ? path.join(process.resourcesPath, 'app.asar', 'node_modules')
      : path.join(__dirname, 'node_modules');
    const nodePathParts = [pluginNodePath];
    if (process.env.NODE_PATH) {
      nodePathParts.push(process.env.NODE_PATH);
    }

    const proc = spawn(process.execPath, [scriptPath], {
      cwd: app.isPackaged ? process.resourcesPath : __dirname,
      shell: false,
      windowsHide: true,
      detached: false,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        ELECTRON_RUN_AS_NODE: '1',
        NODE_PATH: nodePathParts.join(path.delimiter)
      }
    });

    const entry = { process: proc, stopping: false };
    pluginProcesses.set(pluginId, entry);

    sendPluginLog(pluginId, `[Plugin] ${plugin.title} started.`);
    if (proc.stdout) streamPluginOutput(pluginId, proc.stdout);
    if (proc.stderr) streamPluginOutput(pluginId, proc.stderr);

    proc.on('exit', (code, signal) => {
      const finishedEntry = pluginProcesses.get(pluginId);
      pluginProcesses.delete(pluginId);

      const stoppedByUser = Boolean(finishedEntry?.stopping);
      const ok = stoppedByUser || code === 0 || signal === 'SIGTERM' || signal === 'SIGINT';
      const reason = stoppedByUser
        ? 'Stopped by user.'
        : `Exited with code=${code ?? 'null'} signal=${signal ?? 'null'}.`;

      sendPluginLog(pluginId, `[Plugin] ${reason}`);
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('plugin:exit', { pluginId, ok, error: ok ? undefined : reason });
      }
    });

    proc.on('error', (error) => {
      pluginProcesses.delete(pluginId);
      const message = error instanceof Error ? error.message : 'Plugin process failed.';
      sendPluginLog(pluginId, `[Plugin] ${message}`);
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('plugin:exit', { pluginId, ok: false, error: message });
      }
    });

    return { ok: true, status: 'running' };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Failed to start plugin.' };
  }
}

async function autoStartPluginsFromSettings() {
  const settings = readStartupSettings();

  const pluginIds = Object.keys(PLUGIN_REGISTRY);
  await Promise.all(
    pluginIds.map(async (pluginId) => {
      if (!settings.pluginStartWithWindows?.[pluginId]) return;
      const result = await startPluginProcess(pluginId);
      if (!result.ok) {
        sendPluginLog(pluginId, `[Plugin] Auto-start failed: ${result.error || 'unknown error'}`);
      }
    })
  );
}

function runProcessAndWait(file, args) {
  return new Promise((resolve) => {
    try {
      const proc = spawn(file, args, { windowsHide: true, shell: false });
      proc.on('exit', () => resolve());
      proc.on('error', () => resolve());
    } catch {
      resolve();
    }
  });
}

async function closeEditors(ide = 'vscode') {
  if (process.platform === 'win32') {
    const imageNames =
      ide === 'cursor'
        ? ['cursor.exe']
        : ['code.exe', 'code-insiders.exe', 'cursor.exe'];

    await Promise.all(
      imageNames.map((imageName) => runProcessAndWait('taskkill', ['/im', imageName, '/t', '/f']))
    );
    return;
  }

  const processNames =
    ide === 'cursor' ? ['cursor'] : ['code', 'code-insiders', 'cursor'];

  await Promise.all(processNames.map((name) => runProcessAndWait('pkill', ['-f', name])));
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 740,
    minWidth: 1060,
    minHeight: 620,
    frame: false,
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  mainWindow.loadURL(APP_URL);

  mainWindow.on('close', (event) => {
    if (isQuitting) return;
    event.preventDefault();
    mainWindow.hide();
  });
}

function buildUpdaterPayload() {
  return {
    ...updaterState,
    canCheck: !isDev && Boolean(autoUpdater),
    canInstall: updaterState.status === 'downloaded' && Boolean(autoUpdater)
  };
}

function sendUpdaterStatus() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send('app:update-status', buildUpdaterPayload());
}

function setUpdaterState(patch) {
  Object.assign(updaterState, patch);
  sendUpdaterStatus();
}

async function checkForAppUpdates() {
  if (isDev || !autoUpdater) {
    setUpdaterState({
      status: 'idle',
      currentVersion: app.getVersion(),
      availableVersion: null,
      downloadPercent: null,
      error: null
    });
    return { ok: true, skipped: true };
  }

  try {
    await autoUpdater.checkForUpdates();
    return { ok: true };
  } catch (error) {
    setUpdaterState({
      status: 'error',
      error: error instanceof Error ? error.message : 'Failed to check for updates.'
    });
    return { ok: false, error: updaterState.error };
  }
}

function setupAutoUpdater() {
  if (!autoUpdater || isDev) return;

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('checking-for-update', () => {
    setUpdaterState({
      status: 'checking',
      currentVersion: app.getVersion(),
      error: null,
      downloadPercent: null
    });
  });

  autoUpdater.on('update-available', (info) => {
    setUpdaterState({
      status: 'available',
      availableVersion: info?.version || null,
      error: null,
      downloadPercent: 0
    });
  });

  autoUpdater.on('update-not-available', () => {
    setUpdaterState({
      status: 'not-available',
      availableVersion: null,
      downloadPercent: null,
      error: null
    });
  });

  autoUpdater.on('download-progress', (progress) => {
    setUpdaterState({
      status: 'downloading',
      downloadPercent: typeof progress?.percent === 'number' ? progress.percent : null
    });
  });

  autoUpdater.on('update-downloaded', (info) => {
    setUpdaterState({
      status: 'downloaded',
      availableVersion: info?.version || updaterState.availableVersion
    });
  });

  autoUpdater.on('error', (error) => {
    setUpdaterState({
      status: 'error',
      error: error?.message || 'Updater failed.'
    });
  });
}

function showMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (mainWindow.isMinimized()) {
    mainWindow.restore();
  }
  mainWindow.show();
  mainWindow.focus();
}

function createTray() {
  if (tray) return;

  const iconPath = path.join(__dirname, 'public', 'icons', 'openai.png');
  tray = new Tray(iconPath);
  tray.setToolTip('Folder Manager');

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Open HighGround',
      click: () => showMainWindow()
    },
    {
      label: 'About',
      click: () => {
        void dialog.showMessageBox({
          type: 'info',
          title: 'About HighGround',
          message: 'HighGround'
        });
      }
    },
    {
      type: 'separator'
    },
    {
      label: 'Exit HighGround',
      click: () => {
        isQuitting = true;
        app.quit();
      }
    }
  ]);

  tray.setContextMenu(contextMenu);
  tray.on('double-click', () => showMainWindow());
}

function startNextDevServer() {
  if (nextProcess) return;

  nextProcess = spawn('npm', ['run', 'dev'], {
    cwd: __dirname,
    shell: true,
    env: {
      ...process.env,
      NODE_ENV: 'development',
      BROWSER: 'none',
      PORT: String(NEXT_PORT)
    },
    stdio: 'inherit'
  });

  nextProcess.on('exit', () => {
    nextProcess = null;
  });
}

async function startNextProdServer() {
  if (nextServer) return;

  const appDir = app.getAppPath();
  nextApp = next({
    dev: false,
    dir: appDir
  });

  await nextApp.prepare();
  const handle = nextApp.getRequestHandler();

  await new Promise((resolve, reject) => {
    nextServer = http.createServer((req, res) => handle(req, res));
    nextServer.on('error', reject);
    nextServer.listen(NEXT_PORT, '127.0.0.1', () => resolve());
  });
}

async function boot() {
  if (isDev) {
    startNextDevServer();
    if (!waitOn) {
      waitOn = require('wait-on');
    }
    await waitOn({
      resources: [APP_URL],
      timeout: 120000,
      interval: 250,
      validateStatus: (status) => status >= 200 && status < 300
    });
  } else {
    await startNextProdServer();
  }

  const startupSettings = readStartupSettings();
  setAppLoginStartup(startupSettings.appStartWithWindows);

  createWindow();
  createTray();
  setupAutoUpdater();
  sendUpdaterStatus();
  void checkForAppUpdates();
  void autoStartPluginsFromSettings();
}

app.whenReady().then(boot).catch((error) => {
  console.error('Failed to start Electron + Next:', error);
  app.quit();
});

app.on('window-all-closed', () => {
  if (isQuitting && process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  isQuitting = true;

  if (nextProcess) {
    nextProcess.kill();
    nextProcess = null;
  }

  if (nextServer) {
    nextServer.close();
    nextServer = null;
  }

  if (nextApp) {
    nextApp = null;
  }

  if (tray) {
    tray.destroy();
    tray = null;
  }
});

ipcMain.handle('dialog:select-folder', async (_event, defaultPath) => {
  const result = await dialog.showOpenDialog({
    defaultPath: typeof defaultPath === 'string' ? defaultPath : undefined,
    properties: ['openDirectory', 'createDirectory']
  });

  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }

  return result.filePaths[0];
});

ipcMain.on('window:minimize', (event) => {
  BrowserWindow.fromWebContents(event.sender)?.minimize();
});

ipcMain.on('window:maximize-toggle', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win) return;
  if (win.isMaximized()) win.unmaximize();
  else win.maximize();
});

ipcMain.on('window:close', (event) => {
  BrowserWindow.fromWebContents(event.sender)?.hide();
});

ipcMain.handle('instance:open-terminal', async (_event, instancePath, terminal) => {
  if (!instancePath || typeof instancePath !== 'string') {
    return { ok: false, error: 'Invalid instance path.' };
  }

  const launch = buildTerminalLaunch(instancePath, terminal);
  if (!launch.ok) {
    return { ok: false, error: launch.error };
  }

  try {
    const proc = spawn(launch.file, launch.args, {
      cwd: instancePath,
      windowsHide: false,
      detached: true,
      stdio: 'ignore'
    });
    proc.unref();
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Failed to open terminal.' };
  }
});

ipcMain.handle('instance:open-vscode', async (_event, instancePath, ide) => {
  if (!instancePath || typeof instancePath !== 'string') {
    return { ok: false, error: 'Invalid instance path.' };
  }

  try {
    const editorCommand = resolveEditorCommand(ide);
    const editorArgs = [instancePath];
    if ((ide || 'vscode') === 'vscode') {
      editorArgs.unshift('--remote-debugging-port=9222');
    }

    const proc = spawn(editorCommand, editorArgs, {
      cwd: instancePath,
      shell: true,
      detached: true,
      windowsHide: false,
      stdio: 'ignore'
    });
    proc.unref();
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : `Failed to open ${ide || 'IDE'}.`
    };
  }
});

ipcMain.handle('editor:close-all', async (_event, ide) => {
  try {
    await closeEditors(typeof ide === 'string' ? ide : 'vscode');
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Failed to close editor processes.'
    };
  }
});

ipcMain.handle('editor:start', async (_event, ide) => {
  try {
    const normalizedIde = typeof ide === 'string' ? ide : 'vscode';
    const editorCommand = resolveEditorCommand(normalizedIde);
    const editorArgs = normalizedIde === 'vscode' ? ['--remote-debugging-port=9222'] : [];

    const proc = spawn(editorCommand, editorArgs, {
      shell: true,
      detached: true,
      windowsHide: false,
      stdio: 'ignore'
    });
    proc.unref();
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Failed to start editor.'
    };
  }
});

ipcMain.handle('instance:start', async (_event, payload) => {
  const instanceId = payload?.instanceId;
  const instancePath = payload?.instancePath;
  const command = typeof payload?.command === 'string' ? payload.command.trim() : '';

  if (!instanceId || typeof instanceId !== 'string') {
    return { ok: false, error: 'Invalid instance id.' };
  }
  if (!instancePath || typeof instancePath !== 'string') {
    return { ok: false, error: 'Invalid instance path.' };
  }
  if (!command) {
    return { ok: false, error: 'Start command is empty.' };
  }

  const existing = instanceProcesses.get(instanceId);
  if (existing && existing.process && !existing.process.killed) {
    return { ok: true };
  }

  const launch = buildGitBashLaunch(instancePath, command);
  if (!launch.ok) {
    return { ok: false, error: launch.error };
  }

  try {
    const proc = spawn(launch.file, launch.args, {
      cwd: instancePath,
      windowsHide: false,
      detached: true,
      stdio: 'ignore'
    });
    proc.unref();

    instanceProcesses.set(instanceId, { process: proc });

    proc.on('exit', () => {
      instanceProcesses.delete(instanceId);
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('instance:exit', instanceId);
      }
    });

    proc.on('error', () => {
      instanceProcesses.delete(instanceId);
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('instance:exit', instanceId);
      }
    });

    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Failed to start instance process.' };
  }
});

ipcMain.handle('instance:stop', async (_event, instanceId) => {
  if (!instanceId || typeof instanceId !== 'string') {
    return { ok: false, error: 'Invalid instance id.' };
  }

  stopInstanceProcess(instanceId);
  return { ok: true };
});

ipcMain.handle('settings:get-startup', async () => {
  return { ok: true, settings: readStartupSettings() };
});

ipcMain.handle('settings:set-app-startup', async (_event, enabled) => {
  if (typeof enabled !== 'boolean') {
    return { ok: false, error: 'Invalid startup flag.' };
  }

  try {
    const current = readStartupSettings();
    const next = writeStartupSettings({
      ...current,
      appStartWithWindows: enabled
    });
    setAppLoginStartup(enabled);
    return { ok: true, settings: next };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Failed to save startup settings.' };
  }
});

ipcMain.handle('settings:set-plugin-startup', async (_event, payload) => {
  const pluginId = payload?.pluginId;
  const enabled = payload?.enabled;

  if (!pluginId || typeof pluginId !== 'string') {
    return { ok: false, error: 'Invalid plugin id.' };
  }
  if (typeof enabled !== 'boolean') {
    return { ok: false, error: 'Invalid plugin startup flag.' };
  }
  if (!PLUGIN_REGISTRY[pluginId]) {
    return { ok: false, error: `Unknown plugin: ${pluginId}` };
  }

  try {
    const current = readStartupSettings();
    const next = writeStartupSettings({
      ...current,
      pluginStartWithWindows: {
        ...(current.pluginStartWithWindows || {}),
        [pluginId]: enabled
      }
    });
    return { ok: true, settings: next };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Failed to save plugin startup flag.' };
  }
});

ipcMain.handle('app:get-version', async () => {
  return { ok: true, version: app.getVersion() };
});

ipcMain.handle('update:get-status', async () => {
  return { ok: true, ...buildUpdaterPayload() };
});

ipcMain.handle('update:check', async () => {
  return checkForAppUpdates();
});

ipcMain.handle('update:install', async () => {
  if (isDev || !autoUpdater) {
    return { ok: false, error: 'Updates are unavailable in development mode.' };
  }
  if (updaterState.status !== 'downloaded') {
    return { ok: false, error: 'Update package is not ready yet.' };
  }

  isQuitting = true;
  autoUpdater.quitAndInstall(false, true);
  return { ok: true };
});

ipcMain.handle('plugin:status', async (_event, pluginId) => {
  if (!pluginId || typeof pluginId !== 'string') {
    return { ok: false, error: 'Invalid plugin id.' };
  }

  const entry = pluginProcesses.get(pluginId);
  if (entry && entry.process && !entry.process.killed) {
    return { ok: true, status: 'running' };
  }

  return { ok: true, status: 'stopped' };
});

ipcMain.handle('plugin:start', async (_event, pluginId) => {
  return startPluginProcess(pluginId);
});

ipcMain.handle('plugin:stop', async (_event, pluginId) => {
  if (!pluginId || typeof pluginId !== 'string') {
    return { ok: false, error: 'Invalid plugin id.' };
  }

  stopPluginProcess(pluginId);
  return { ok: true, status: 'stopped' };
});
