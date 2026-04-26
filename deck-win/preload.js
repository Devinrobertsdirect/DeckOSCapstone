const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  getAppVersion: () => ipcRenderer.invoke("get-app-version"),
  getAiStatus: () => ipcRenderer.invoke("get-ai-status"),
  platform: process.platform,
});
