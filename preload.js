const { contextBridge, ipcRenderer } = require('electron');

console.log('[preload] cargando preload');
try {
  contextBridge.exposeInMainWorld('electronAPI', {
    toggleClickThrough: () => ipcRenderer.invoke('toggle-click-through'),
    setClickThrough: (enabled) => ipcRenderer.invoke('set-click-through', enabled),
    getClickThroughStatus: () => ipcRenderer.invoke('get-click-through-status'),
    onStatusChange: (callback) => ipcRenderer.on('click-through-status', (_, status) => callback(status)),
    getConfig: () => ipcRenderer.invoke('get-config'),
    setConfig: (partial) => {
      console.log('[preload] setConfig invocado con:', partial);
      return ipcRenderer.invoke('set-config', partial);
    },
    onConfigUpdated: (callback) => ipcRenderer.on('config-updated', (_, config) => callback(config)),
    openSettings: () => ipcRenderer.invoke('open-settings'),
    openConfigFolder: () => ipcRenderer.invoke('open-config-folder'),
    checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
    installUpdate: () => ipcRenderer.invoke('install-update'),
    twitchAuthStart: (creds) => ipcRenderer.invoke('twitch-auth-start', creds),
    onUpdaterStatus: (callback) => ipcRenderer.on('updater-status', (_, payload) => callback(payload)),
    onChatMessage: (callback) => ipcRenderer.on('chat-message', (_, msg) => callback(msg)),
  });
  console.log('[preload] electronAPI expuesto');
} catch (e) {
  console.log('[preload] ERROR al exponer electronAPI:', e.message);
}
