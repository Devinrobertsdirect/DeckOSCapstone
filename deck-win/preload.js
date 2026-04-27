const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  getAppVersion: () => ipcRenderer.invoke("get-app-version"),
  getAiStatus: () => ipcRenderer.invoke("get-ai-status"),
  platform: process.platform,

  // Desktop notifications opt-in / opt-out
  getNotificationsEnabled: () => ipcRenderer.invoke("get-notifications-enabled"),
  setNotificationsEnabled: (enabled) => ipcRenderer.invoke("set-notifications-enabled", enabled),
  onNotificationsEnabledChanged: (callback) => {
    const handler = (_event, value) => callback(value);
    ipcRenderer.on("notifications-enabled-changed", handler);
    return () => ipcRenderer.removeListener("notifications-enabled-changed", handler);
  },
});
