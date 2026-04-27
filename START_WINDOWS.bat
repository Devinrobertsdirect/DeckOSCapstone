@echo off
title Deck OS — Starting...
color 0A
cls

echo.
echo  ██████╗ ███████╗ ██████╗██╗  ██╗     ██████╗ ███████╗
echo  ██╔══██╗██╔════╝██╔════╝██║ ██╔╝    ██╔═══██╗██╔════╝
echo  ██║  ██║█████╗  ██║     █████╔╝     ██║   ██║███████╗
echo  ██║  ██║██╔══╝  ██║     ██╔═██╗     ██║   ██║╚════██║
echo  ██████╔╝███████╗╚██████╗██║  ██╗    ╚██████╔╝███████║
echo  ╚═════╝ ╚══════╝ ╚═════╝╚═╝  ╚═╝     ╚═════╝ ╚══════╝
echo.
echo  JARVIS Command Center — Windows Launcher
echo  ════════════════════════════════════════
echo.

:: ── Step 1: Check Node.js ───────────────────────────────────────────────────
echo  [1/5] Checking Node.js...
node --version >nul 2>&1
if errorlevel 1 (
  color 0C
  echo.
  echo  ERROR: Node.js is not installed.
  echo  Please download and install it from: https://nodejs.org
  echo  Choose the LTS version, then run this file again.
  echo.
  pause
  exit /b 1
)
for /f "tokens=*" %%v in ('node --version') do echo         Found %%v

:: ── Step 2: Check / install pnpm ────────────────────────────────────────────
echo  [2/5] Checking pnpm...
pnpm --version >nul 2>&1
if errorlevel 1 (
  echo         Installing pnpm...
  npm install -g pnpm >nul 2>&1
  if errorlevel 1 (
    color 0C
    echo.
    echo  ERROR: Could not install pnpm. Try running this as Administrator.
    echo.
    pause
    exit /b 1
  )
)
for /f "tokens=*" %%v in ('pnpm --version') do echo         Found pnpm %%v

:: ── Step 3: Check .env ──────────────────────────────────────────────────────
echo  [3/5] Checking environment...
if not exist .env (
  if exist .env.example (
    copy .env.example .env >nul
    echo         Created .env from .env.example
    echo.
    echo  ACTION REQUIRED: Open the .env file and set your DATABASE_URL.
    echo  Then run this launcher again.
    echo.
    start notepad .env
    pause
    exit /b 0
  ) else (
    color 0C
    echo.
    echo  ERROR: No .env file found. Create one with your DATABASE_URL.
    echo.
    pause
    exit /b 1
  )
) else (
  echo         .env found
)

:: ── Load DATABASE_URL from .env ─────────────────────────────────────────────
for /f "usebackq tokens=1,* delims==" %%a in (".env") do (
  set "line=%%a"
  if "!line:~0,1!" neq "#" (
    if "%%a"=="DATABASE_URL" set "DATABASE_URL=%%b"
  )
)
setlocal enabledelayedexpansion
for /f "usebackq tokens=1,* delims==" %%a in (".env") do (
  set "line=%%a"
  if "!line:~0,1!" neq "#" (
    set "%%a=%%b"
  )
)

:: ── Step 4: Install dependencies ────────────────────────────────────────────
echo  [4/5] Installing dependencies (first run may take 1-2 minutes)...
call pnpm install --ignore-scripts >nul 2>&1
if errorlevel 1 (
  color 0C
  echo.
  echo  ERROR: Dependency installation failed.
  echo  Try deleting the node_modules folder and running again.
  echo.
  pause
  exit /b 1
)
call pnpm rebuild esbuild >nul 2>&1
call pnpm rebuild >nul 2>&1
echo         Dependencies ready

:: ── Step 5: Start services ──────────────────────────────────────────────────
echo  [5/5] Starting Deck OS...
echo.

start "Deck OS — API" /min cmd /c "pnpm --filter @workspace/api-server run dev"
timeout /t 3 /nobreak >nul
start "Deck OS — Frontend" /min cmd /c "pnpm --filter @workspace/deck-os run dev"

echo  Waiting for services to start...
timeout /t 8 /nobreak >nul

echo.
echo  ════════════════════════════════════════════════════════
echo.
echo   Deck OS is starting!
echo.
echo   Opening your browser to: http://localhost:3000
echo.
echo   If the page is blank, wait 30 seconds and refresh.
echo.
echo   To stop Deck OS: close the two minimized windows
echo   titled "Deck OS — API" and "Deck OS — Frontend"
echo.
echo  ════════════════════════════════════════════════════════
echo.

start "" "http://localhost:3000"

pause
