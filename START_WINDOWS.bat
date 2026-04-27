@echo off
setlocal enabledelayedexpansion
title Deck OS Launcher
color 0A
cls

echo.
echo  ==========================================
echo   DECK OS -- JARVIS Command Center
echo   Local AI Dashboard Launcher
echo  ==========================================
echo.

:: ── Step 1: Check Node.js ───────────────────────────────────────────────────
echo  [1/5] Checking Node.js...
node --version >nul 2>&1
if errorlevel 1 (
  color 0C
  echo.
  echo  ERROR: Node.js is not installed.
  echo  Please visit https://nodejs.org and install the LTS version.
  echo  Then double-click this file again.
  echo.
  pause
  exit /b 1
)
for /f %%v in ('node --version') do echo         Found Node.js %%v

:: ── Step 2: Check pnpm ──────────────────────────────────────────────────────
echo  [2/5] Checking pnpm...
pnpm --version >nul 2>&1
if errorlevel 1 (
  echo         Installing pnpm...
  call npm install -g pnpm
  if errorlevel 1 (
    color 0C
    echo.
    echo  ERROR: Could not install pnpm.
    echo  Try right-clicking this file and running as Administrator.
    echo.
    pause
    exit /b 1
  )
)
for /f %%v in ('pnpm --version') do echo         Found pnpm %%v

:: ── Step 3: Check .env ──────────────────────────────────────────────────────
echo  [3/5] Checking configuration...
if not exist .env (
  if exist .env.example (
    copy .env.example .env >nul
    echo.
    echo  ACTION REQUIRED:
    echo  A .env file was created. Open it in Notepad and set your DATABASE_URL.
    echo  Save the file, then double-click this launcher again.
    echo.
    start notepad .env
    pause
    exit /b 0
  ) else (
    color 0C
    echo.
    echo  ERROR: No .env file found. Please add your database credentials.
    echo.
    pause
    exit /b 1
  )
)
echo         Configuration found

:: ── Load env vars from .env ─────────────────────────────────────────────────
for /f "usebackq tokens=1,* delims==" %%a in (".env") do (
  set "firstchar=%%a"
  set "firstchar=!firstchar:~0,1!"
  if not "!firstchar!"=="#" (
    if not "%%a"=="" (
      set "%%a=%%b"
    )
  )
)

:: ── Step 4: Install dependencies ────────────────────────────────────────────
echo  [4/5] Installing dependencies...
echo         (first run may take 1-2 minutes, please wait)
call pnpm install --ignore-scripts
if errorlevel 1 (
  color 0C
  echo.
  echo  ERROR: Dependency installation failed. See above for details.
  echo.
  pause
  exit /b 1
)
call pnpm rebuild esbuild >nul 2>&1
call pnpm rebuild >nul 2>&1
echo         Dependencies ready

:: ── Step 5: Start services ──────────────────────────────────────────────────
echo  [5/5] Starting services...
start "Deck OS API" /min cmd /c "pnpm --filter @workspace/api-server run dev 2>&1"
timeout /t 4 /nobreak >nul
start "Deck OS Frontend" /min cmd /c "pnpm --filter @workspace/deck-os run dev 2>&1"

echo         Waiting for startup...
timeout /t 10 /nobreak >nul

echo.
echo  ==========================================
echo   Deck OS is running!
echo.
echo   Opening browser to http://localhost:3000
echo   If the page is blank, wait 30 seconds
echo   and press F5 to refresh.
echo.
echo   To STOP: close the two minimized windows
echo   named "Deck OS API" and "Deck OS Frontend"
echo  ==========================================
echo.

start "" "http://localhost:3000"
pause
