const { app, BrowserWindow, ipcMain, shell } = require("electron");
const path = require("path");
const { spawn } = require("child_process");
const http = require("http");

const API_PORT = 8080;
const STARTUP_TIMEOUT_MS = 20_000;
let apiProcess = null;

function getResourcePath(...parts) {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, ...parts);
  }
  return path.join(__dirname, "..", ...parts);
}

function waitForApi(port, timeoutMs) {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + timeoutMs;
    const check = () => {
      http.get(`http://127.0.0.1:${port}/api/health`, (res) => {
        if (res.statusCode < 500) {
          resolve();
        } else {
          retry();
        }
      }).on("error", retry);
    };
    const retry = () => {
      if (Date.now() > deadline) {
        reject(new Error("API server did not start in time"));
      } else {
        setTimeout(check, 400);
      }
    };
    check();
  });
}

function startApiServer() {
  const apiDist = getResourcePath("api-dist");
  const serverEntry = path.join(apiDist, "index.js");
  const frontendDist = getResourcePath("frontend-dist");

  apiProcess = spawn(
    process.execPath,
    [serverEntry],
    {
      env: {
        ...process.env,
        NODE_ENV: "production",
        PORT: String(API_PORT),
        ELECTRON_STATIC: "1",
        ELECTRON_FRONTEND_DIST: frontendDist,
      },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    }
  );

  apiProcess.stdout.on("data", (d) => process.stdout.write(d));
  apiProcess.stderr.on("data", (d) => process.stderr.write(d));

  apiProcess.on("exit", (code) => {
    console.log(`[deck-win] API process exited with code ${code}`);
  });
}

async function createWindow() {
  startApiServer();

  const splash = new BrowserWindow({
    width: 480,
    height: 320,
    frame: false,
    transparent: true,
    resizable: false,
    alwaysOnTop: true,
    icon: path.join(__dirname, "build", "icon.png"),
    webPreferences: { nodeIntegration: false, contextIsolation: true },
  });

  splash.loadURL(
    "data:text/html,<html><body style='background:#000;display:flex;align-items:center;justify-content:center;height:100vh;margin:0'>" +
    "<img src='file://" + path.join(__dirname, "build", "icon.png").replace(/\\/g, "/") + "' style='width:220px;filter:drop-shadow(0 0 24px #3f84f3);animation:p 2s ease-in-out infinite' />" +
    "<style>@keyframes p{0%,100%{opacity:.6}50%{opacity:1}}</style></body></html>"
  );

  try {
    await waitForApi(API_PORT, STARTUP_TIMEOUT_MS);
  } catch (err) {
    console.error("[deck-win]", err.message);
  }

  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 900,
    minHeight: 620,
    icon: path.join(__dirname, "build", "icon.png"),
    title: "Deck OS — JARVIS Command Center",
    backgroundColor: "#000000",
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });

  win.loadURL(`http://127.0.0.1:${API_PORT}/`);

  win.once("ready-to-show", () => {
    splash.destroy();
    win.show();
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  win.on("closed", () => {
    if (apiProcess) {
      apiProcess.kill();
      apiProcess = null;
    }
  });
}

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  if (apiProcess) {
    apiProcess.kill();
  }
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

ipcMain.handle("get-app-version", () => app.getVersion());
