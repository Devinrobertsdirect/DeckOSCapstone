# PowerShell MUST be "Continue" -- "Stop" causes NativeCommandError on ANY stderr
# from native executables (npm, node, pnpm all write to stderr normally).
$ErrorActionPreference = "Continue"
$ProgressPreference    = "SilentlyContinue"
$Host.UI.RawUI.WindowTitle = "Deck OS Setup"

function Write-Header {
  Clear-Host
  Write-Host ""
  Write-Host "  ==========================================" -ForegroundColor Cyan
  Write-Host "   DECK OS -- JARVIS Command Center"         -ForegroundColor Cyan
  Write-Host "   Windows Setup and Launcher"               -ForegroundColor Cyan
  Write-Host "  ==========================================" -ForegroundColor Cyan
  Write-Host ""
}
function Write-Step($n, $total, $msg) {
  Write-Host ""
  Write-Host "  [$n/$total] $msg" -ForegroundColor White
}
function Write-Ok($msg)   { Write-Host "        Done: $msg"    -ForegroundColor Green  }
function Write-Info($msg) { Write-Host "        $msg"          -ForegroundColor Gray   }
function Write-Warn($msg) { Write-Host "        WARNING: $msg" -ForegroundColor Yellow }
function Write-Err($msg)  {
  Write-Host ""
  Write-Host "  ERROR: $msg" -ForegroundColor Red
  Write-Host ""
}

# Run a command through cmd.exe to avoid PowerShell's stderr-as-error behaviour.
# Returns the process exit code.
function Invoke-Cmd($command) {
  $proc = Start-Process cmd -ArgumentList "/c $command" -Wait -PassThru -NoNewWindow
  return $proc.ExitCode
}

$dir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $dir

Write-Header
Write-Host "  This script will set up and launch Deck OS on your computer." -ForegroundColor Gray
Write-Host "  Do not close this window until you see the final status message." -ForegroundColor Yellow
Write-Host ""

# ── 1. Node.js ────────────────────────────────────────────────────────────────
Write-Step 1 6 "Checking for Node.js..."
Write-Info "Node.js is the engine that runs Deck OS..."
$nodeVer = (& node --version 2>$null)
if ((-not $nodeVer) -or ($LASTEXITCODE -ne 0)) {
  Write-Err "Node.js is not installed."
  Write-Host "  Go to https://nodejs.org, download LTS, run the installer, then try again." -ForegroundColor Yellow
  Read-Host "  Press Enter to close"
  exit 1
}
Write-Ok "Node.js $nodeVer is installed"

# ── 2. pnpm ───────────────────────────────────────────────────────────────────
Write-Step 2 6 "Checking for pnpm (package manager)..."
Write-Info "pnpm manages all the libraries Deck OS depends on..."

# The standalone pnpm installer puts its binary at %LOCALAPPDATA%\pnpm.
# Registry PATH changes never affect the current running session automatically,
# so we inject the directory into $env:PATH right now.
$pnpmHome = Join-Path $env:LOCALAPPDATA "pnpm"
if ((Test-Path $pnpmHome) -and ($env:PATH -notlike "*$pnpmHome*")) {
  $env:PATH = "$pnpmHome;$env:PATH"
}

$pnpmOk = ((Invoke-Cmd "pnpm --version >nul 2>&1") -eq 0)
if (-not $pnpmOk) {
  Write-Info "Not found -- installing via standalone installer..."
  try {
    Invoke-WebRequest "https://get.pnpm.io/install.ps1" -UseBasicParsing | Invoke-Expression
    # Installer updates the registry but NOT this session -- inject it now
    if ((Test-Path $pnpmHome) -and ($env:PATH -notlike "*$pnpmHome*")) {
      $env:PATH = "$pnpmHome;$env:PATH"
    }
    # Also re-read registry in case the installer chose a different directory
    $uPath = [System.Environment]::GetEnvironmentVariable("PATH", "User")
    $mPath = [System.Environment]::GetEnvironmentVariable("PATH", "Machine")
    $env:PATH = "$pnpmHome;$uPath;$mPath"
  } catch {
    Write-Info "Standalone installer failed -- trying npm fallback..."
    $code = Invoke-Cmd "npm install -g pnpm"
    if ($code -ne 0) {
      Write-Err "Could not install pnpm. Right-click setup.ps1 and choose Run as Administrator."
      Read-Host "  Press Enter to close"
      exit 1
    }
  }
}

# Verify pnpm is reachable via cmd (never the PS1 shim)
$pnpmVer = (& cmd /c "pnpm --version 2>nul")
if (-not $pnpmVer) {
  # Last resort: find pnpm.exe anywhere under LOCALAPPDATA and add its folder to PATH
  Write-Info "Searching for pnpm.exe in user data folder..."
  $found = (Get-ChildItem -Path $env:LOCALAPPDATA -Filter "pnpm.exe" -Recurse -Depth 6 -ErrorAction SilentlyContinue |
            Sort-Object LastWriteTime -Descending |
            Select-Object -First 1)
  if ($found) {
    $env:PATH = "$($found.DirectoryName);$env:PATH"
    $pnpmVer  = (& cmd /c "pnpm --version 2>nul")
    if ($pnpmVer) { Write-Info "Found pnpm at $($found.FullName)" }
  }
}
if (-not $pnpmVer) {
  Write-Err "pnpm could not be added to PATH automatically."
  Write-Host "  Open a NEW PowerShell window and run setup.ps1 again." -ForegroundColor Yellow
  Write-Host "  (The installer updated your user PATH -- a new window will see it.)" -ForegroundColor Gray
  Read-Host "  Press Enter to close"
  exit 0
}
Write-Ok "pnpm $pnpmVer is installed"

# ── 3. .env ───────────────────────────────────────────────────────────────────
Write-Step 3 6 "Checking configuration (.env)..."
Write-Info "The .env file stores your database connection..."
if (-not (Test-Path ".env")) {
  if (Test-Path ".env.example") {
    Copy-Item ".env.example" ".env"
    Write-Host "  ACTION REQUIRED: Open .env, set your DATABASE_URL, save it, then run again." -ForegroundColor Yellow
    Start-Process notepad ".env"
    Read-Host "  Press Enter to close"
    exit 0
  }
  Write-Err "No .env file found."
  Read-Host "  Press Enter to close"
  exit 1
}
Write-Ok ".env file found"
Get-Content ".env" | ForEach-Object {
  if ($_ -match "^\s*([^#=][^=]*)=(.*)$") {
    $k = $Matches[1].Trim()
    $v = $Matches[2].Trim().Trim('"').Trim("'")
    [System.Environment]::SetEnvironmentVariable($k, $v, "Process")
  }
}

# ── 4. Dependencies ───────────────────────────────────────────────────────────
Write-Step 4 6 "Installing dependencies..."
Write-Info "This may take 1-2 minutes on first run. Please wait..."
Write-Info "Removing Linux lockfile so Windows packages resolve correctly..."
if (Test-Path "pnpm-lock.yaml") { Remove-Item "pnpm-lock.yaml" -Force }

$code = Invoke-Cmd "pnpm install --ignore-scripts"
if ($code -ne 0) {
  Write-Err "Dependency install failed. Check your internet connection and try again."
  Read-Host "  Press Enter to close"
  exit 1
}
Invoke-Cmd "pnpm rebuild >nul 2>&1" | Out-Null
Write-Ok "All dependencies installed and ready"

# ── 5. Desktop shortcut ───────────────────────────────────────────────────────
Write-Step 5 6 "Creating desktop shortcut..."
try {
  $desktop = [System.Environment]::GetFolderPath("Desktop")
  $wsh = New-Object -ComObject WScript.Shell
  $sc  = $wsh.CreateShortcut((Join-Path $desktop "Deck OS.lnk"))
  $sc.TargetPath       = (Join-Path $dir "start.bat")
  $sc.WorkingDirectory = $dir
  $sc.Description      = "Launch Deck OS JARVIS Command Center"
  $sc.Save()
  Write-Ok "Shortcut 'Deck OS' added to your Desktop"
} catch {
  Write-Info "Could not create shortcut -- use start.bat directly"
}

# ── 6. Launch ─────────────────────────────────────────────────────────────────
Write-Step 6 6 "Starting Deck OS..."
$apiLog    = Join-Path $dir "api-server.log"
$apiErrLog = Join-Path $dir "api-server-err.log"
$webLog    = Join-Path $dir "frontend.log"
$webErrLog = Join-Path $dir "frontend-err.log"

# Kill any leftover processes holding the ports
foreach ($port in @(8080, 5173)) {
  $lines = (& netstat -ano 2>$null) | Select-String ":$port\s"
  foreach ($line in $lines) {
    if ($line -match '\s+(\d+)$') {
      Stop-Process -Id ([int]$Matches[1]) -Force -ErrorAction SilentlyContinue
    }
  }
}

Write-Info "Starting API server (port 8080)..."
$apiArgs = @{
  FilePath               = "cmd"
  ArgumentList           = "/c set PORT=8080 && set NODE_ENV=development && pnpm --filter @workspace/api-server run dev"
  WorkingDirectory       = $dir
  RedirectStandardOutput = $apiLog
  RedirectStandardError  = $apiErrLog
  WindowStyle            = "Hidden"
  PassThru               = $true
}
Start-Process @apiArgs | Out-Null

Start-Sleep -Seconds 5

Write-Info "Starting frontend (port 5173)..."
$webArgs = @{
  FilePath               = "cmd"
  ArgumentList           = "/c set PORT=5173 && set NODE_ENV=development && pnpm --filter @workspace/deck-os run dev"
  WorkingDirectory       = $dir
  RedirectStandardOutput = $webLog
  RedirectStandardError  = $webErrLog
  WindowStyle            = "Hidden"
  PassThru               = $true
}
Start-Process @webArgs | Out-Null

Write-Host ""
Write-Info "Waiting up to 60 seconds for services to start..."
$apiUp = $false
$webUp = $false
for ($i = 0; $i -lt 20; $i++) {
  Start-Sleep -Seconds 3
  Write-Host "." -NoNewline -ForegroundColor Gray
  try {
    $t = New-Object System.Net.Sockets.TcpClient
    $t.Connect("localhost", 8080)
    $t.Close()
    $apiUp = $true
  } catch {}
  try {
    $t = New-Object System.Net.Sockets.TcpClient
    $t.Connect("localhost", 5173)
    $t.Close()
    $webUp = $true
  } catch {}
  if ($apiUp -and $webUp) { break }
}
Write-Host ""
Write-Host ""

Write-Host "  ==========================================" -ForegroundColor Cyan
if ($apiUp -and $webUp) {
  Write-Host "   Deck OS is running!" -ForegroundColor Green
  Write-Host "   Opening browser to http://localhost:5173" -ForegroundColor White
  Start-Process "http://localhost:5173"
} else {
  Write-Host "   Services did not start in time." -ForegroundColor Yellow
  Write-Host ""
  foreach ($errFile in @($apiErrLog, $webErrLog)) {
    if (Test-Path $errFile) {
      $lines = Get-Content $errFile | Where-Object { $_ -match '\S' } | Select-Object -Last 20
      if ($lines) {
        Write-Host "  -- $errFile --" -ForegroundColor Red
        $lines | ForEach-Object { Write-Host "  $_" -ForegroundColor Gray }
        Write-Host ""
      }
    }
  }
}
Write-Host "  ==========================================" -ForegroundColor Cyan
Write-Host ""

# ── OpenClaw (optional, WSL2/Ubuntu) ─────────────────────────────────────────
Write-Host ""
Write-Host "  -- OpenClaw Status --" -ForegroundColor Cyan

$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole(
  [Security.Principal.WindowsBuiltInRole]::Administrator
)
$wslExe       = "C:\Windows\System32\wsl.exe"
$wslAvailable = (Test-Path $wslExe)

if ($wslAvailable) {
  # Check Ubuntu distro is present (output may have UTF-16 null bytes on older Windows)
  $distros  = (& $wslExe --list --quiet 2>$null) -replace '\0', '' |
              Where-Object { $_ -match '\S' }
  $ubuntuOk = $distros | Where-Object { $_ -match '^Ubuntu' }
  if (-not $ubuntuOk) { $wslAvailable = $false }
}

if (-not $wslAvailable) {
  Write-Host "  OpenClaw requires WSL2 + Ubuntu (not detected)." -ForegroundColor Yellow
  if ($isAdmin) {
    Write-Host "  Enabling WSL2 features (a restart will be required)..." -ForegroundColor Gray
    & C:\Windows\System32\dism.exe /online /enable-feature /featurename:Microsoft-Windows-Subsystem-Linux /all /norestart 2>$null | Out-Null
    & C:\Windows\System32\dism.exe /online /enable-feature /featurename:VirtualMachinePlatform /all /norestart 2>$null | Out-Null
    Write-Host "  WSL2 features enabled. RESTART your PC, then run: wsl --install -d Ubuntu" -ForegroundColor Yellow
  } else {
    Write-Host "  After Ubuntu is installed, run setup.ps1 again and it will auto-start OpenClaw." -ForegroundColor Gray
    Write-Host "  To install Ubuntu: wsl --install -d Ubuntu" -ForegroundColor Gray
  }
} else {
  $clawUp = $false
  try {
    $t = New-Object System.Net.Sockets.TcpClient
    $t.Connect("localhost", 18789)
    $t.Close()
    $clawUp = $true
  } catch {}

  if (-not $clawUp) {
    $openclawInstalled = $false
    try {
      & $wslExe -d Ubuntu -- bash -c "which openclaw" 2>$null | Out-Null
      $openclawInstalled = ($LASTEXITCODE -eq 0)
    } catch {}

    if ($openclawInstalled) {
      Write-Info "Starting OpenClaw gateway via Ubuntu..."
      $launchCmd = "nohup openclaw gateway > ~/.openclaw/logs/gateway.log 2>&1 &"
      Start-Process $wslExe -ArgumentList "-d Ubuntu -- bash -c `"$launchCmd`"" -WindowStyle Hidden
      Start-Sleep -Seconds 6
      try {
        $t = New-Object System.Net.Sockets.TcpClient
        $t.Connect("localhost", 18789)
        $t.Close()
        $clawUp = $true
      } catch {}
    } else {
      Write-Host "  OpenClaw not installed in Ubuntu." -ForegroundColor Yellow
      Write-Host "  Use Settings -> OpenClaw in the app to install it automatically." -ForegroundColor Gray
    }
  }

  if ($clawUp) {
    Write-Host "  OpenClaw gateway running on port 18789 -- connected to Deck OS" -ForegroundColor Green
  }
}

Write-Host ""
Read-Host "  Press Enter to close this setup window"
