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
  Write-Host "  [$n/$total] $msg" -ForegroundColor White
}

function Write-Ok($msg)  { Write-Host "        OK: $msg" -ForegroundColor Green }
function Write-Err($msg) { Write-Host ""; Write-Host "  ERROR: $msg" -ForegroundColor Red; Write-Host "" }

$dir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $dir

Write-Header

# 1. Node.js
Write-Step 1 5 "Checking Node.js..."
try {
  $nodeVer = & node --version 2>&1
  Write-Ok "Node.js $nodeVer"
} catch {
  Write-Err "Node.js is not installed."
  Write-Host "  Visit https://nodejs.org and install the LTS version, then run this again." -ForegroundColor Yellow
  Read-Host "  Press Enter to close"
  exit 1
}

# 2. pnpm
Write-Step 2 5 "Checking pnpm..."
$pnpmOk = $false
try { & pnpm --version 2>&1 | Out-Null; $pnpmOk = $true } catch {}
if (-not $pnpmOk) {
  Write-Host "        Installing pnpm..." -ForegroundColor Yellow
  & npm install -g pnpm
  if ($LASTEXITCODE -ne 0) {
    Write-Err "Could not install pnpm. Try right-clicking START_WINDOWS.bat and Run as Administrator."
    Read-Host "  Press Enter to close"; exit 1
  }
}
$pnpmVer = & pnpm --version 2>&1
Write-Ok "pnpm $pnpmVer"

# 3. .env
Write-Step 3 5 "Checking configuration..."
if (-not (Test-Path ".env")) {
  if (Test-Path ".env.example") {
    Copy-Item ".env.example" ".env"
    Write-Host ""
    Write-Host "  A .env file was created. Open it, set your DATABASE_URL, save it, then run this again." -ForegroundColor Yellow
    Start-Process notepad ".env"
    Read-Host "  Press Enter to close"; exit 0
  }
  Write-Err "No .env file found."
  Read-Host "  Press Enter to close"; exit 1
}
Write-Ok ".env found"

# Load .env into process environment
Get-Content ".env" | ForEach-Object {
  if ($_ -match "^\s*([^#=][^=]*)=(.*)$") {
    $k = $Matches[1].Trim()
    $v = $Matches[2].Trim().Trim('"').Trim("'")
    [System.Environment]::SetEnvironmentVariable($k, $v, "Process")
  }
}

# 4. Dependencies
Write-Step 4 5 "Installing dependencies (first run: 1-2 minutes)..."
& pnpm install --ignore-scripts
if ($LASTEXITCODE -ne 0) {
  Write-Err "Dependency install failed. See messages above."
  Read-Host "  Press Enter to close"; exit 1
}
& pnpm rebuild esbuild 2>&1 | Out-Null
& pnpm rebuild 2>&1 | Out-Null
Write-Ok "Dependencies ready"

# 5. Launch
Write-Step 5 5 "Starting services..."
Start-Process cmd -ArgumentList "/c title Deck OS API && pnpm --filter @workspace/api-server run dev" -WindowStyle Minimized
Start-Sleep -Seconds 4
Start-Process cmd -ArgumentList "/c title Deck OS Frontend && pnpm --filter @workspace/deck-os run dev" -WindowStyle Minimized
Write-Host "        Waiting for startup..." -ForegroundColor Gray
Start-Sleep -Seconds 12
Start-Process "http://localhost:3000"

Write-Host ""
Write-Host "  ==========================================" -ForegroundColor Green
Write-Host "   Deck OS is running!" -ForegroundColor Green
Write-Host "   Browser opened to http://localhost:3000" -ForegroundColor White
Write-Host "   If blank, wait 30 sec then press F5." -ForegroundColor Gray
Write-Host "   To STOP: close the two minimized windows" -ForegroundColor Gray
Write-Host "  ==========================================" -ForegroundColor Green
Write-Host ""
Read-Host "  Press Enter to close this window"
