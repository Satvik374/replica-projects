// Minimal, explicit bridge. The renderer never gets Node access.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('cadence', {
  isDesktop: true,
  platform: process.platform,
  saveProject: (payload) => ipcRenderer.invoke('project:save', payload),
  openProject: () => ipcRenderer.invoke('project:open'),
  saveBinary: (payload) => ipcRenderer.invoke('file:save-binary', payload),
  windowAction: (action) => ipcRenderer.invoke('window:action', action),
  setMenu: (tree) => ipcRenderer.invoke('menu:set', tree),
  onMenuCommand: (handler) => {
    const listener = (_event, command) => handler(command);
    ipcRenderer.on('menu:command', listener);
    return () => ipcRenderer.removeListener('menu:command', listener);
  },
  openExternal: (url) => ipcRenderer.invoke('app:open-external', url),
  appInfo: () => ipcRenderer.invoke('app:info'),
});
