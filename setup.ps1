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
function Write-Step($n, $total, $msg) { Write-Host ""; Write-Host "  [$n/$total] $msg" -ForegroundColor White }
function Write-Ok($msg)   { Write-Host "        Done: $msg" -ForegroundColor Green }
function Write-Info($msg) { Write-Host "        $msg" -ForegroundColor Gray }
function Write-Warn($msg) { Write-Host "        WARNING: $msg" -ForegroundColor Yellow }
function Write-Err($msg)  { Write-Host ""; Write-Host "  ERROR: $msg" -ForegroundColor Red; Write-Host "" }

$dir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $dir

Write-Header
Write-Host "  This script will set up and launch Deck OS on your computer." -ForegroundColor Gray
Write-Host "  Do not close this window until you see the final status message." -ForegroundColor Yellow
Write-Host ""

# 1. Node.js
Write-Step 1 6 "Checking for Node.js..."
Write-Info "Node.js is the engine that runs Deck OS..."
try {
  $nodeVer = & node --version 2>&1
  Write-Ok "Node.js $nodeVer is installed"
} catch {
  Write-Err "Node.js is not installed."
  Write-Host "  Go to https://nodejs.org, download LTS, run the installer, then try again." -ForegroundColor Yellow
  Read-Host "  Press Enter to close"; exit 1
}

# 2. pnpm
Write-Step 2 6 "Checking for pnpm (package manager)..."
Write-Info "pnpm manages all the libraries Deck OS depends on..."
$pnpmOk = $false
try { & pnpm --version 2>&1 | Out-Null; $pnpmOk = $true } catch {}
if (-not $pnpmOk) {
  Write-Info "Not found -- installing automatically..."
  & npm install -g pnpm
  if ($LASTEXITCODE -ne 0) {
    Write-Err "Could not install pnpm. Right-click START_WINDOWS.bat and choose Run as Administrator."
    Read-Host "  Press Enter to close"; exit 1
  }
}
$pnpmVer = & pnpm --version 2>&1
Write-Ok "pnpm $pnpmVer is installed"

# 3. .env
Write-Step 3 6 "Checking configuration (.env)..."
Write-Info "The .env file stores your database connection..."
if (-not (Test-Path ".env")) {
  if (Test-Path ".env.example") {
    Copy-Item ".env.example" ".env"
    Write-Host "  ACTION REQUIRED: Open .env, set your DATABASE_URL, save it, then run again." -ForegroundColor Yellow
    Start-Process notepad ".env"
    Read-Host "  Press Enter to close"; exit 0
  }
  Write-Err "No .env file found."; Read-Host "  Press Enter to close"; exit 1
}
Write-Ok ".env file found"
$openaiKey = $env:OPENAI_API_KEY
if (-not $openaiKey) {
  Write-Host ""
  Write-Host "  NOTE: OPENAI_API_KEY is not set in your .env file." -ForegroundColor Yellow
  Write-Host "  AI chat features will not work until you add it." -ForegroundColor Yellow
  Write-Host "  Open .env in Notepad and add: OPENAI_API_KEY=sk-..." -ForegroundColor Yellow
  Write-Host ""
}
Get-Content ".env" | ForEach-Object {
  if ($_ -match "^\s*([^#=][^=]*)=(.*)$") {
    $k = $Matches[1].Trim(); $v = $Matches[2].Trim().Trim('"').Trim("'")
    [System.Environment]::SetEnvironmentVariable($k, $v, "Process")
  }
}

# 4. Dependencies
Write-Step 4 6 "Installing dependencies..."
Write-Info "This may take 1-2 minutes on first run. Please wait..."
Write-Host ""
Write-Info "Removing Linux lockfile so Windows packages are resolved correctly..."
if (Test-Path "pnpm-lock.yaml") { Remove-Item "pnpm-lock.yaml" -Force }
& pnpm install --ignore-scripts
if ($LASTEXITCODE -ne 0) {
  Write-Err "Dependency install failed."; Read-Host "  Press Enter to close"; exit 1
}
Write-Info "Finalizing native components..."
& pnpm rebuild 2>&1 | Out-Null
Write-Ok "All dependencies installed and ready"

# 5. Desktop shortcut
Write-Step 5 6 "Creating desktop shortcut..."
try {
  $desktop = [System.Environment]::GetFolderPath("Desktop")
  $wsh = New-Object -ComObject WScript.Shell
  $sc = $wsh.CreateShortcut((Join-Path $desktop "Deck OS.lnk"))
  $sc.TargetPath = (Join-Path $dir "START_WINDOWS.bat")
  $sc.WorkingDirectory = $dir
  $sc.Description = "Launch Deck OS JARVIS Command Center"
  $sc.Save()
  Write-Ok "Shortcut 'Deck OS' added to your Desktop"
} catch { Write-Info "Could not create shortcut -- use START_WINDOWS.bat directly" }

# 6. Launch
Write-Step 6 6 "Starting Deck OS..."
$apiLog = Join-Path $dir "api-server.log"
$webLog = Join-Path $dir "frontend.log"
# Kill any leftover processes from a previous run (fast netstat method)
foreach ($port in @(8080, 3000)) { netstat -ano 2>$null | Select-String ":$port" | ForEach-Object { if ($_ -match '\s+(\d+)$') { Stop-Process -Id ([int]$Matches[1]) -Force -ErrorAction SilentlyContinue } } }

Write-Info "Starting API server..."
$env:PORT = "8080"
$env:BASE_PATH = "/"
$env:NODE_ENV = "development"
$apiProc = Start-Process cmd -ArgumentList "/c set PORT=8080 && set BASE_PATH=/ && set NODE_ENV=development && pnpm --filter @workspace/api-server run dev" -WorkingDirectory $dir -RedirectStandardOutput $apiLog -RedirectStandardError (Join-Path $dir "api-server-err.log") -WindowStyle Hidden -PassThru

Start-Sleep -Seconds 5
Write-Info "Starting frontend..."
$webProc = Start-Process cmd -ArgumentList "/c set PORT=3000 && set BASE_PATH=/ && set NODE_ENV=development && pnpm --filter @workspace/deck-os run dev" -WorkingDirectory $dir -RedirectStandardOutput $webLog -RedirectStandardError (Join-Path $dir "frontend-err.log") -WindowStyle Hidden -PassThru

Write-Host ""
Write-Info "Waiting up to 60 seconds for services to start..."
$apiUp = $false; $webUp = $false
for ($i = 0; $i -lt 20; $i++) {
  Start-Sleep -Seconds 3
  Write-Host "." -NoNewline -ForegroundColor Gray
  try { $t = New-Object System.Net.Sockets.TcpClient; $t.Connect("localhost", 8080); $t.Close(); $apiUp = $true } catch {}
  try { $t = New-Object System.Net.Sockets.TcpClient; $t.Connect("localhost", 3000); $t.Close(); $webUp = $true } catch {}
  if ($apiUp -and $webUp) { break }
}
Write-Host ""

Write-Host ""
Write-Host "  ==========================================" -ForegroundColor Cyan
if ($apiUp -and $webUp) {
  Write-Host "   Deck OS is running!" -ForegroundColor Green
  Write-Host "   Opening browser to http://localhost:3000" -ForegroundColor White
  Start-Process "http://localhost:3000"
} else {
  Write-Host "   Services did not start. Here is what went wrong:" -ForegroundColor Yellow
  Write-Host ""
  $errLog = Join-Path $dir "api-server-err.log"
  if (Test-Path $errLog) {
    $lines = Get-Content $errLog | Where-Object { $_ -match '\S' } | Select-Object -Last 25
    if ($lines) { Write-Host "  -- API Server errors --" -ForegroundColor Red; $lines | ForEach-Object { Write-Host "  $_" -ForegroundColor Gray } }
  }
  $errLog2 = Join-Path $dir "frontend-err.log"
  if (Test-Path $errLog2) {
    $lines2 = Get-Content $errLog2 | Where-Object { $_ -match '\S' } | Select-Object -Last 25
    if ($lines2) { Write-Host "  -- Frontend errors --" -ForegroundColor Red; $lines2 | ForEach-Object { Write-Host "  $_" -ForegroundColor Gray } }
  }
}
Write-Host "  ==========================================" -ForegroundColor Cyan
Write-Host ""

# ── OpenClaw (optional messaging bridge) ────────────────────────────────────
Write-Host ""
Write-Host "  -- OpenClaw Status --" -ForegroundColor Cyan

$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
$wslPath = "C:\Windows\System32\wsl.exe"
$wslAvailable = Test-Path $wslPath
if ($wslAvailable) {
  try { & $wslPath --status 2>&1 | Out-Null; $wslAvailable = $LASTEXITCODE -eq 0 } catch { $wslAvailable = $false }
}

if (-not $wslAvailable) {
  Write-Host "  OpenClaw requires WSL2 which is not yet active." -ForegroundColor Yellow
  if ($isAdmin) {
    Write-Host "  Enabling WSL2 features (a restart will be required)..." -ForegroundColor Gray
    & C:\Windows\System32\dism.exe /online /enable-feature /featurename:Microsoft-Windows-Subsystem-Linux /all /norestart 2>&1 | Out-Null
    & C:\Windows\System32\dism.exe /online /enable-feature /featurename:VirtualMachinePlatform /all /norestart 2>&1 | Out-Null
    Write-Host "  WSL2 features enabled. RESTART your computer, then run setup again." -ForegroundColor Yellow
    Write-Host "  After restart, in a terminal run: wsl --install -d Ubuntu" -ForegroundColor Gray
  } else {
    Write-Host "  If you already ran DISM -> restart your computer then run setup again." -ForegroundColor Gray
    Write-Host "  Otherwise -> right-click START_WINDOWS.bat and Run as Administrator." -ForegroundColor Gray
    Write-Host "  After restart, in a terminal run: wsl --install -d Ubuntu" -ForegroundColor Gray
  }
} else {
  $clawUp = $false
  try { $t = New-Object System.Net.Sockets.TcpClient; $t.Connect("localhost", 18789); $t.Close(); $clawUp = $true } catch {}
  if (-not $clawUp) {
    $openclawInstalled = $false
    try { $r = & $wslPath -e which openclaw 2>&1; $openclawInstalled = $LASTEXITCODE -eq 0 } catch {}
    if ($openclawInstalled) {
      Write-Host "  Starting OpenClaw gateway..." -ForegroundColor Gray
      Start-Process $wslPath -ArgumentList "-e ollama launch openclaw" -WindowStyle Hidden
      Start-Sleep -Seconds 6
      try { $t = New-Object System.Net.Sockets.TcpClient; $t.Connect("localhost", 18789); $t.Close(); $clawUp = $true } catch {}
    } else {
      Write-Host "  OpenClaw not found in WSL. To install:" -ForegroundColor Yellow
      Write-Host "    1. Open a terminal and type: wsl" -ForegroundColor Gray
      Write-Host "    2. Then run: curl -fsSL https://docs.openclaw.ai/install.sh | bash" -ForegroundColor Gray
    }
  }
  if ($clawUp) {
    Write-Host "  OpenClaw gateway running on port 18789 - connected to Deck OS" -ForegroundColor Green
  }
}

Read-Host "  Press Enter to close this setup window"
