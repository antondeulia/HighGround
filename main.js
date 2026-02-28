const { app, BrowserWindow, dialog, ipcMain } = require('electron');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const waitOn = require('wait-on');

const NEXT_PORT = Number(process.env.ELECTRON_NEXT_PORT || 3310);
const APP_URL = `http://localhost:${NEXT_PORT}`;
let nextProcess = null;
let mainWindow = null;
const instanceProcesses = new Map();
const pluginProcesses = new Map();

const PLUGIN_REGISTRY = {
  'codex-auto-submit': {
    id: 'codex-auto-submit',
    title: 'Codex Auto-Submit',
    scriptPath: path.join(__dirname, 'src', 'plugins', 'CodexAutoSubmit.js')
  }
};

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
}

function startNextDevServer() {
  if (nextProcess) return;

  nextProcess = spawn('npm', ['run', 'dev'], {
    cwd: __dirname,
    shell: true,
    env: {
      ...process.env,
      BROWSER: 'none',
      PORT: String(NEXT_PORT)
    },
    stdio: 'inherit'
  });

  nextProcess.on('exit', () => {
    nextProcess = null;
  });
}

async function boot() {
  startNextDevServer();

  await waitOn({
    resources: [APP_URL],
    timeout: 120000,
    interval: 250,
    validateStatus: (status) => status >= 200 && status < 500
  });

  createWindow();
}

app.whenReady().then(boot).catch((error) => {
  console.error('Failed to start Electron + Next:', error);
  app.quit();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  if (nextProcess) {
    nextProcess.kill();
    nextProcess = null;
  }

  for (const instanceId of instanceProcesses.keys()) {
    stopInstanceProcess(instanceId);
  }

  for (const pluginId of pluginProcesses.keys()) {
    stopPluginProcess(pluginId);
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
  BrowserWindow.fromWebContents(event.sender)?.close();
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
      detached: false,
      stdio: 'ignore'
    });

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

  if (!fs.existsSync(plugin.scriptPath)) {
    return { ok: false, error: `Plugin script not found: ${plugin.scriptPath}` };
  }

  try {
    const proc = spawn('node', [plugin.scriptPath], {
      cwd: __dirname,
      shell: true,
      windowsHide: true,
      detached: false,
      env: process.env
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
});

ipcMain.handle('plugin:stop', async (_event, pluginId) => {
  if (!pluginId || typeof pluginId !== 'string') {
    return { ok: false, error: 'Invalid plugin id.' };
  }

  stopPluginProcess(pluginId);
  return { ok: true, status: 'stopped' };
});
