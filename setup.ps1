$ErrorActionPreference = "Stop"
$Host.UI.RawUI.WindowTitle = "Deck OS Setup"

function Write-Header {
  Clear-Host
  Write-Host ""
  Write-Host "  ==========================================" -ForegroundColor Cyan
  Write-Host "   DECK OS -- JARVIS Command Center" -ForegroundColor Cyan
  Write-Host "   Windows Setup and Launcher" -ForegroundColor Cyan
  Write-Host "  ==========================================" -ForegroundColor Cyan
  Write-Host ""
}

function Write-Step($n, $total, $msg) {
  Write-Host ""
  Write-Host "  [$n/$total] $msg" -ForegroundColor White
}

function Write-Ok($msg)    { Write-Host "        Done: $msg" -ForegroundColor Green }
function Write-Info($msg)  { Write-Host "        $msg" -ForegroundColor Gray }
function Write-Err($msg)   { Write-Host ""; Write-Host "  ERROR: $msg" -ForegroundColor Red; Write-Host "" }

$dir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $dir

Write-Header
Write-Host "  This script will set up and launch Deck OS on your computer." -ForegroundColor Gray
Write-Host "  It only needs to do the full setup once. Future launches are faster." -ForegroundColor Gray
Write-Host ""
Write-Host "  Do not close this window until you see 'Deck OS is running!'" -ForegroundColor Yellow
Write-Host ""

# ── Step 1: Node.js ──────────────────────────────────────────────────────────
Write-Step 1 6 "Checking for Node.js..."
Write-Info "Node.js is the engine that runs Deck OS. Checking if it is installed..."
try {
  $nodeVer = & node --version 2>&1
  Write-Ok "Node.js $nodeVer is installed"
} catch {
  Write-Err "Node.js is not installed."
  Write-Host "  What to do:" -ForegroundColor Yellow
  Write-Host "    1. Open a browser and go to: https://nodejs.org" -ForegroundColor Yellow
  Write-Host "    2. Click the big green LTS button to download" -ForegroundColor Yellow
  Write-Host "    3. Run the installer (click Next until it finishes)" -ForegroundColor Yellow
  Write-Host "    4. Come back and double-click START_WINDOWS.bat again" -ForegroundColor Yellow
  Write-Host ""
  Read-Host "  Press Enter to close"
  exit 1
}

# ── Step 2: pnpm ─────────────────────────────────────────────────────────────
Write-Step 2 6 "Checking for pnpm (package manager)..."
Write-Info "pnpm manages all the code libraries Deck OS depends on..."
$pnpmOk = $false
try { & pnpm --version 2>&1 | Out-Null; $pnpmOk = $true } catch {}
if (-not $pnpmOk) {
  Write-Info "pnpm not found -- installing it now automatically..."
  & npm install -g pnpm
  if ($LASTEXITCODE -ne 0) {
    Write-Err "Could not install pnpm automatically."
    Write-Host "  What to do:" -ForegroundColor Yellow
    Write-Host "    Right-click START_WINDOWS.bat and choose 'Run as Administrator'" -ForegroundColor Yellow
    Write-Host ""
    Read-Host "  Press Enter to close"; exit 1
  }
  Write-Ok "pnpm installed successfully"
} else {
  $pnpmVer = & pnpm --version 2>&1
  Write-Ok "pnpm $pnpmVer is installed"
}

# ── Step 3: .env configuration ───────────────────────────────────────────────
Write-Step 3 6 "Checking configuration file (.env)..."
Write-Info "The .env file stores your database connection and other settings..."
if (-not (Test-Path ".env")) {
  if (Test-Path ".env.example") {
    Copy-Item ".env.example" ".env"
    Write-Host ""
    Write-Host "  ACTION REQUIRED:" -ForegroundColor Yellow
    Write-Host "  A settings file (.env) has been created and is opening in Notepad." -ForegroundColor Yellow
    Write-Host "  Find the line that starts with DATABASE_URL= and paste your" -ForegroundColor Yellow
    Write-Host "  database connection string after the equals sign." -ForegroundColor Yellow
    Write-Host "  Save the file (Ctrl+S), then double-click START_WINDOWS.bat again." -ForegroundColor Yellow
    Write-Host ""
    Start-Process notepad ".env"
    Read-Host "  Press Enter to close"; exit 0
  }
  Write-Err "No .env settings file found."
  Write-Host "  Create a file named .env in this folder with your DATABASE_URL." -ForegroundColor Yellow
  Read-Host "  Press Enter to close"; exit 1
}
Write-Ok ".env settings file found"

# Load .env vars into session
Get-Content ".env" | ForEach-Object {
  if ($_ -match "^\s*([^#=][^=]*)=(.*)$") {
    $k = $Matches[1].Trim()
    $v = $Matches[2].Trim().Trim('"').Trim("'")
    [System.Environment]::SetEnvironmentVariable($k, $v, "Process")
  }
}

# ── Step 4: Install dependencies ─────────────────────────────────────────────
Write-Step 4 6 "Installing dependencies..."
Write-Info "Downloading all the code libraries Deck OS needs to run."
Write-Info "This only happens on the first run and may take 1-2 minutes."
Write-Info "Please wait -- do not close this window..."
Write-Host ""
& pnpm install --ignore-scripts
if ($LASTEXITCODE -ne 0) {
  Write-Err "Dependency installation failed."
  Write-Host "  Check your internet connection and try again." -ForegroundColor Yellow
  Write-Host "  If it keeps failing, delete the node_modules folder and try again." -ForegroundColor Yellow
  Read-Host "  Press Enter to close"; exit 1
}
Write-Info "Finalizing native components..."
& pnpm rebuild esbuild 2>&1 | Out-Null
& pnpm rebuild 2>&1 | Out-Null
Write-Ok "All dependencies installed and ready"

# ── Step 5: Desktop shortcut ─────────────────────────────────────────────────
Write-Step 5 6 "Creating desktop shortcut..."
Write-Info "Adding a Deck OS shortcut to your Desktop for easy access..."
try {
  $desktop = [System.Environment]::GetFolderPath("Desktop")
  $shortcutPath = Join-Path $desktop "Deck OS.lnk"
  $batPath = Join-Path $dir "START_WINDOWS.bat"
  $wsh = New-Object -ComObject WScript.Shell
  $shortcut = $wsh.CreateShortcut($shortcutPath)
  $shortcut.TargetPath = $batPath
  $shortcut.WorkingDirectory = $dir
  $shortcut.Description = "Launch Deck OS JARVIS Command Center"
  $shortcut.WindowStyle = 1
  $shortcut.Save()
  Write-Ok "Shortcut 'Deck OS' added to your Desktop"
} catch {
  Write-Host "        Could not create shortcut -- use START_WINDOWS.bat directly" -ForegroundColor Gray
}

# ── Step 6: Launch ───────────────────────────────────────────────────────────
Write-Step 6 6 "Starting Deck OS..."
Write-Info "Starting the API server (backend)..."
Start-Process cmd -ArgumentList "/c title Deck OS API && pnpm --filter @workspace/api-server run dev" -WindowStyle Minimized
Start-Sleep -Seconds 4
Write-Info "Starting the frontend (dashboard interface)..."
Start-Process cmd -ArgumentList "/c title Deck OS Frontend && pnpm --filter @workspace/deck-os run dev" -WindowStyle Minimized
Write-Info "Giving services time to start up (about 15 seconds)..."
Start-Sleep -Seconds 15
Write-Info "Opening your browser..."
Start-Process "http://localhost:3000"

Write-Host ""
Write-Host "  ==========================================" -ForegroundColor Green
Write-Host "   Deck OS is running!" -ForegroundColor Green
Write-Host ""
Write-Host "   Your browser should now show the dashboard." -ForegroundColor White
Write-Host "   If the page is blank, wait 30 seconds" -ForegroundColor Gray
Write-Host "   and press F5 to refresh." -ForegroundColor Gray
Write-Host ""
Write-Host "   A 'Deck OS' shortcut was added to your" -ForegroundColor White
Write-Host "   Desktop. Use it to launch Deck OS anytime." -ForegroundColor Gray
Write-Host ""
Write-Host "   To STOP Deck OS: look in your taskbar for" -ForegroundColor Gray
Write-Host "   'Deck OS API' and 'Deck OS Frontend' and" -ForegroundColor Gray
Write-Host "   close both windows." -ForegroundColor Gray
Write-Host "  ==========================================" -ForegroundColor Green
Write-Host ""
Read-Host "  Press Enter to close this setup window"
