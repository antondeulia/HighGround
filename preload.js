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
  startPlugin: (pluginId) => ipcRenderer.invoke('plugin:start', pluginId),
  stopPlugin: (pluginId) => ipcRenderer.invoke('plugin:stop', pluginId),
  getPluginStatus: (pluginId) => ipcRenderer.invoke('plugin:status', pluginId),
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
  }
});
