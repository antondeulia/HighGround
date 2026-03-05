const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electron', {
  platform: process.platform,
  selectFolder: (defaultPath) => ipcRenderer.invoke('dialog:select-folder', defaultPath),
  minimizeWindow: () => ipcRenderer.send('window:minimize'),
  toggleMaximizeWindow: () => ipcRenderer.send('window:maximize-toggle'),
  closeWindow: () => ipcRenderer.send('window:close'),
  startInstance: (payload) => ipcRenderer.invoke('instance:start', payload),
  stopInstance: (instanceId) => ipcRenderer.invoke('instance:stop', instanceId),
  openInstanceTerminal: (instancePath, terminal) =>
    ipcRenderer.invoke('instance:open-terminal', instancePath, terminal),
  openInstanceVsCode: (instancePath, ide) => ipcRenderer.invoke('instance:open-vscode', instancePath, ide),
  closeAllEditors: (ide) => ipcRenderer.invoke('editor:close-all', ide),
  startEditor: (ide) => ipcRenderer.invoke('editor:start', ide),
  startPlugin: (pluginId) => ipcRenderer.invoke('plugin:start', pluginId),
  stopPlugin: (pluginId) => ipcRenderer.invoke('plugin:stop', pluginId),
  getPluginStatus: (pluginId) => ipcRenderer.invoke('plugin:status', pluginId),
  getStartupSettings: () => ipcRenderer.invoke('settings:get-startup'),
  setAppStartup: (enabled) => ipcRenderer.invoke('settings:set-app-startup', enabled),
  setPluginStartup: (pluginId, enabled) =>
    ipcRenderer.invoke('settings:set-plugin-startup', { pluginId, enabled }),
  getAppVersion: () => ipcRenderer.invoke('app:get-version'),
  getUpdateStatus: () => ipcRenderer.invoke('update:get-status'),
  checkForUpdates: () => ipcRenderer.invoke('update:check'),
  installUpdate: () => ipcRenderer.invoke('update:install'),
  onInstanceExit: (handler) => {
    const listener = (_event, instanceId) => handler(instanceId);
    ipcRenderer.on('instance:exit', listener);
    return () => {
      ipcRenderer.removeListener('instance:exit', listener);
    };
  },
  onPluginLog: (handler) => {
    const listener = (_event, payload) => handler(payload);
    ipcRenderer.on('plugin:log', listener);
    return () => {
      ipcRenderer.removeListener('plugin:log', listener);
    };
  },
  onPluginExit: (handler) => {
    const listener = (_event, payload) => handler(payload);
    ipcRenderer.on('plugin:exit', listener);
    return () => {
      ipcRenderer.removeListener('plugin:exit', listener);
    };
  },
  onUpdateStatus: (handler) => {
    const listener = (_event, payload) => handler(payload);
    ipcRenderer.on('app:update-status', listener);
    return () => {
      ipcRenderer.removeListener('app:update-status', listener);
    };
  }
});
