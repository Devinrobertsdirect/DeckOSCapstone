@echo off
setlocal enabledelayedexpansion

call :MAIN
echo.
echo  Press any key to close this window...
pause >nul
exit /b

:: ════════════════════════════════════════════════════════════
:MAIN
cls
echo.
echo  ==========================================
echo   DECK OS -- JARVIS Command Center
echo   Windows Launcher
echo  ==========================================
echo.

echo  [1/5] Checking Node.js...
node --version >nul 2>&1
if !errorlevel! neq 0 (
  echo.
  echo  ERROR: Node.js is not installed.
  echo  Visit https://nodejs.org and install the LTS version.
  echo  Then run this file again.
  exit /b 1
)
for /f "tokens=*" %%v in ('node --version') do echo         Found Node.js %%v

echo  [2/5] Checking pnpm...
call pnpm --version >nul 2>&1
if !errorlevel! neq 0 (
  echo         Installing pnpm...
  call npm install -g pnpm
  if !errorlevel! neq 0 (
    echo.
    echo  ERROR: Could not install pnpm.
    echo  Try right-clicking this file and running as Administrator.
    exit /b 1
  )
)
for /f "tokens=*" %%v in ('pnpm --version') do echo         Found pnpm %%v

echo  [3/5] Checking configuration...
if not exist ".env" (
  if exist ".env.example" (
    copy ".env.example" ".env" >nul
    echo.
    echo  A .env file was created from the example.
    echo  Open it, set your DATABASE_URL, save it, then run this again.
    echo.
    start notepad ".env"
    exit /b 0
  )
  echo.
  echo  ERROR: No .env file found.
  echo  Create a .env file with your DATABASE_URL and try again.
  exit /b 1
)
echo         .env found

echo  [4/5] Installing dependencies (first run: 1-2 minutes)...
call pnpm install --ignore-scripts
if !errorlevel! neq 0 (
  echo.
  echo  ERROR: Dependency install failed. See messages above.
  exit /b 1
)
call pnpm rebuild esbuild >nul 2>&1
call pnpm rebuild >nul 2>&1
echo         Done

echo  [5/5] Starting services...
start "Deck OS API" cmd /c "pnpm --filter @workspace/api-server run dev"
timeout /t 4 /nobreak >nul
start "Deck OS Frontend" cmd /c "pnpm --filter @workspace/deck-os run dev"
timeout /t 10 /nobreak >nul

start "" "http://localhost:3000"

echo.
echo  ==========================================
echo   Deck OS is running!
echo.
echo   Browser opened to http://localhost:3000
echo   If blank, wait 30 sec then press F5.
echo.
echo   To stop: close the two windows named
echo   "Deck OS API" and "Deck OS Frontend"
echo  ==========================================
exit /b 0
