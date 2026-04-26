# Deck OS — Windows Desktop App

Iron Man JARVIS-style AI Command Center running locally on your Windows machine.

## Quick Start (Development / No-Build)

> Requires: Node.js 18+, the API server built, and the frontend built.

1. **Build the API server** (from repo root):
   ```bat
   cd artifacts\api-server
   pnpm run build
   ```

2. **Build the frontend** (from repo root):
   ```bat
   cd artifacts\deck-os
   pnpm run build
   ```

3. **Copy build outputs** into `deck-win/`:
   ```bat
   xcopy /E /I artifacts\api-server\dist deck-win\api-dist
   xcopy /E /I artifacts\deck-os\dist deck-win\frontend-dist
   ```

4. **Launch**:
   ```bat
   deck-win\launch.bat
   ```
   Or from inside the `deck-win\` directory:
   ```bat
   npm start
   ```

---

## Build a Distributable Windows .exe

### Prerequisites
- Node.js 18+
- Windows (or Wine on Linux/macOS)

### Steps

```bat
REM 1. Build API & frontend (see above)
REM 2. Copy outputs (see above)
REM 3. Install Electron builder deps
cd deck-win
npm install

REM 4. Build installer (.exe) + portable
npm run build
```

Outputs land in `deck-win\dist-win\`:
- `Deck OS Setup 1.0.0.exe` — NSIS installer (creates Start Menu + Desktop shortcut)
- `Deck OS 1.0.0.exe` — Single-file portable executable (no install needed)

---

## Architecture

```
deck-win/
├── main.js          ← Electron main process
│   • Spawns the API server as a child Node process
│   • Shows splash screen while API warms up
│   • Opens BrowserWindow pointed at http://127.0.0.1:8080
├── preload.js       ← Context bridge (exposes safe Electron APIs to renderer)
├── package.json     ← electron-builder config + scripts
├── launch.bat       ← Zero-install Windows launcher
└── build/
    └── icon.png     ← App icon (custom logo)
```

The API server runs on `http://127.0.0.1:8080` and serves both the REST API
(`/api/*`) and the pre-built frontend (`/*`) via Express static middleware when
the `ELECTRON_STATIC=1` environment variable is set.

---

## Ollama / Open WebUI

Both backends are auto-detected at startup:
- **Ollama**: `http://localhost:11434` (default)
- **Open WebUI**: `http://localhost:3000` (default)

You can override these in **Settings → Connections** inside the app.

---

## Requirements

| Component | Minimum |
|-----------|---------|
| OS | Windows 10 x64 or later |
| Node.js | 18 LTS or later |
| RAM | 4 GB (8 GB recommended) |
| Ollama | Optional — install from https://ollama.com |
| Open WebUI | Optional — install via Docker or exe |
