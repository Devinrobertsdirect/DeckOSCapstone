@echo off
:: Keep window open even if script errors — wrap in cmd /k
if not "%DECKOS_RUNNING%"=="1" (
  set DECKOS_RUNNING=1
  cmd /k ""%~f0""
  exit /b
)

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
  echo.
  echo  ERROR: Node.js is not installed.
  echo  Go to https://nodejs.org and install the LTS version.
  echo  Then double-click this file again.
  echo.
  goto :end
)
for /f "tokens=*" %%v in ('node --version 2^>^&1') do echo         Found Node.js %%v

:: ── Step 2: Check pnpm ──────────────────────────────────────────────────────
echo  [2/5] Checking pnpm...
pnpm --version >nul 2>&1
if errorlevel 1 (
  echo         pnpm not found, installing...
  npm install -g pnpm
  if errorlevel 1 (
    echo.
    echo  ERROR: Could not install pnpm.
    echo  Right-click this file and choose "Run as Administrator".
    echo.
    goto :end
  )
)
for /f "tokens=*" %%v in ('pnpm --version 2^>^&1') do echo         Found pnpm %%v

:: ── Step 3: Check .env ──────────────────────────────────────────────────────
echo  [3/5] Checking configuration...
if not exist .env (
  if exist .env.example (
    copy .env.example .env >nul
    echo.
    echo  A .env file was created. Open it and set your DATABASE_URL.
    echo  Save the file, then double-click the launcher again.
    echo.
    start notepad .env
    goto :end
  )
  echo.
  echo  ERROR: No .env file found.
  echo  Create a .env file with your DATABASE_URL and try again.
  echo.
  goto :end
)
echo         Configuration found

:: ── Load DATABASE_URL from .env into environment ─────────────────────────────
for /f "usebackq tokens=1,* delims==" %%K in (".env") do (
  echo %%K | findstr /b "#" >nul || set "%%K=%%L"
)

:: ── Step 4: Install dependencies ─────────────────────────────────────────────
echo  [4/5] Installing dependencies...
echo         Please wait, this may take 1-2 minutes on first run...
call pnpm install --ignore-scripts
if errorlevel 1 (
  echo.
  echo  ERROR: Dependency installation failed. See above for details.
  echo.
  goto :end
)
call pnpm rebuild esbuild >nul 2>&1
call pnpm rebuild >nul 2>&1
echo         Dependencies ready

:: ── Step 5: Start services ───────────────────────────────────────────────────
echo  [5/5] Starting services...
start "Deck OS API" cmd /c "pnpm --filter @workspace/api-server run dev"
timeout /t 4 /nobreak >nul
start "Deck OS Frontend" cmd /c "pnpm --filter @workspace/deck-os run dev"
echo         Waiting for startup (about 10 seconds)...
timeout /t 10 /nobreak >nul

echo.
echo  ==========================================
echo   Deck OS is running!
echo.
echo   Your browser should open automatically.
echo   If not, go to: http://localhost:3000
echo.
echo   If the page is blank, wait 30 seconds
echo   and press F5 to refresh.
echo.
echo   To STOP: close the two windows named
echo   "Deck OS API" and "Deck OS Frontend"
echo  ==========================================
echo.
start "" "http://localhost:3000"

:end
echo.
echo  Press any key to close this window...
pause >nul
