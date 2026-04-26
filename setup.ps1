<#
.SYNOPSIS
  Deck OS — Local Setup Script for Windows (PowerShell)

.DESCRIPTION
  Sets up Deck OS on Windows. Checks prerequisites, copies .env, installs
  dependencies, and runs database migrations.

.PARAMETER Start
  After setup, start the API server and frontend dev servers.

.PARAMETER Docker
  Use Docker Compose instead of bare-metal Node/pnpm setup (recommended).

.EXAMPLE
  .\setup.ps1             # Bare-metal setup
  .\setup.ps1 -Start      # Setup + start dev servers
  .\setup.ps1 -Docker     # Docker Compose setup (easiest)
#>

param(
  [switch]$Start,
  [switch]$Docker
)

$ErrorActionPreference = "Stop"

function Write-Banner {
  $c = "Cyan"
  Write-Host ""
  Write-Host "  ██████╗ ███████╗ ██████╗██╗  ██╗     ██████╗ ███████╗" -ForegroundColor $c
  Write-Host "  ██╔══██╗██╔════╝██╔════╝██║ ██╔╝    ██╔═══██╗██╔════╝" -ForegroundColor $c
  Write-Host "  ██║  ██║█████╗  ██║     █████╔╝     ██║   ██║███████╗" -ForegroundColor $c
  Write-Host "  ██║  ██║██╔══╝  ██║     ██╔═██╗     ██║   ██║╚════██║" -ForegroundColor $c
  Write-Host "  ██████╔╝███████╗╚██████╗██║  ██╗    ╚██████╔╝███████║" -ForegroundColor $c
  Write-Host "  ╚═════╝ ╚══════╝ ╚═════╝╚═╝  ╚═╝     ╚═════╝ ╚══════╝" -ForegroundColor $c
  Write-Host ""
  Write-Host "  [deck-os] JARVIS Command Center — Windows Setup" -ForegroundColor Cyan
  Write-Host ""
}

function Log   { param([string]$msg) Write-Host "  [deck-os] $msg" -ForegroundColor Cyan }
function Ok    { param([string]$msg) Write-Host "  OK  $msg" -ForegroundColor Green }
function Warn  { param([string]$msg) Write-Host "  WARN  $msg" -ForegroundColor Yellow }
function Fail  { param([string]$msg) Write-Host "  ERROR  $msg" -ForegroundColor Red; exit 1 }

Write-Banner

# ─────────────────────────────────────
# Docker Compose fast-path
# ─────────────────────────────────────
if ($Docker) {
  Log "Docker Compose mode selected"

  if (-not (Get-Command "docker" -ErrorAction SilentlyContinue)) {
    Fail "Docker not found. Install Docker Desktop from https://www.docker.com/products/docker-desktop"
  }
  $dockerVer = docker --version
  Ok "Docker found: $dockerVer"

  try {
    docker info 2>&1 | Out-Null
    Ok "Docker daemon is running"
  } catch {
    Fail "Docker daemon is not running. Start Docker Desktop and try again."
  }

  if (-not (Test-Path ".env")) {
    Copy-Item ".env.example" ".env"
    Ok "Created .env from .env.example"
    Warn "Edit .env to add optional API keys (Ollama is auto-detected on the host)."
    Write-Host ""
    Read-Host "  Press ENTER to continue, or Ctrl+C to edit .env first"
  } else {
    Ok ".env already exists (skipping copy)"
  }

  Log "Starting all services via Docker Compose..."
  Write-Host "  (Building images on first run — this may take a few minutes)"
  Write-Host ""
  docker compose up -d --build

  Write-Host ""
  Write-Host "  Deck OS is running!" -ForegroundColor Green
  Write-Host ""
  Write-Host "  Frontend   ->  http://localhost:3000"
  Write-Host "  API server ->  http://localhost:8080"
  Write-Host "  Logs:          docker compose logs -f"
  Write-Host "  Stop:          docker compose down"
  Write-Host ""
  exit 0
}

# ─────────────────────────────────────
# 1. Node.js
# ─────────────────────────────────────
Log "Checking Node.js..."
if (-not (Get-Command "node" -ErrorAction SilentlyContinue)) {
  Fail "Node.js not found. Install Node.js 20+ from https://nodejs.org or via winget: winget install OpenJS.NodeJS.LTS"
}
$nodeRaw = node --version
$nodeMajor = [int]($nodeRaw.TrimStart("v").Split(".")[0])
if ($nodeMajor -lt 20) {
  Fail "Node.js 20+ required (found $nodeRaw). Download the latest LTS from https://nodejs.org"
}
Ok "Node.js $nodeRaw"

# ─────────────────────────────────────
# 2. pnpm
# ─────────────────────────────────────
Log "Checking pnpm..."
if (-not (Get-Command "pnpm" -ErrorAction SilentlyContinue)) {
  Warn "pnpm not found. Installing via corepack..."
  try {
    corepack enable
    corepack prepare pnpm@latest --activate
  } catch {
    Warn "corepack failed. Trying npm install -g pnpm..."
    npm install -g pnpm
  }
}
$pnpmVer = pnpm --version
Ok "pnpm v$pnpmVer"

# ─────────────────────────────────────
# 3. PostgreSQL
# ─────────────────────────────────────
Log "Checking PostgreSQL..."
if (Get-Command "pg_isready" -ErrorAction SilentlyContinue) {
  $pgReady = pg_isready -q 2>&1
  if ($LASTEXITCODE -eq 0) {
    Ok "PostgreSQL is running"
    if (Get-Command "psql" -ErrorAction SilentlyContinue) {
      psql -U postgres -c "CREATE ROLE deckos WITH LOGIN PASSWORD 'deckos';" 2>&1 | Out-Null
      psql -U postgres -c "CREATE DATABASE deckos OWNER deckos;" 2>&1 | Out-Null
      Ok "Database 'deckos' is ready"
    }
  } else {
    Warn "PostgreSQL found but not responding."
    Warn "Start it from Services (services.msc) or run: net start postgresql"
    Warn "Or use Docker: .\setup.ps1 -Docker"
  }
} elseif (Get-Command "psql" -ErrorAction SilentlyContinue) {
  Warn "psql found but pg_isready not in PATH. Assuming Postgres is available."
  psql -U postgres -c "CREATE ROLE deckos WITH LOGIN PASSWORD 'deckos';" 2>&1 | Out-Null
  psql -U postgres -c "CREATE DATABASE deckos OWNER deckos;" 2>&1 | Out-Null
} else {
  Warn "PostgreSQL client tools not found."
  Warn "Install PostgreSQL from https://www.postgresql.org/download/windows/"
  Warn "Or use Docker for the simplest setup: .\setup.ps1 -Docker"
}

# ─────────────────────────────────────
# 4. Ollama (optional)
# ─────────────────────────────────────
Log "Checking Ollama (optional)..."
if (Get-Command "ollama" -ErrorAction SilentlyContinue) {
  $ollamaVer = ollama --version 2>&1 | Select-Object -First 1
  Ok "Ollama found: $ollamaVer"
  try {
    $response = Invoke-WebRequest -Uri "http://localhost:11434/api/tags" -TimeoutSec 2 -ErrorAction Stop
    Ok "Ollama is running"
    Log "  Tip: pull the default models if you haven't already:"
    Write-Host "       ollama pull gemma3:9b"
    Write-Host "       ollama pull phi3"
  } catch {
    Warn "Ollama is installed but not running. Start it with: ollama serve"
  }
} else {
  Warn "Ollama not found. Deck OS will run in rule-engine fallback mode."
  Warn "Install from: https://ollama.com  (free, local AI inference)"
}

# ─────────────────────────────────────
# 5. .env file
# ─────────────────────────────────────
Log "Setting up environment..."
if (-not (Test-Path ".env")) {
  Copy-Item ".env.example" ".env"
  Ok "Created .env from .env.example"
  Warn "Edit .env and set DATABASE_URL before continuing."
  Write-Host ""
  Read-Host "  Press ENTER after editing .env to continue, or Ctrl+C to stop now"
} else {
  Ok ".env already exists (skipping copy)"
}

# Load .env into current session
if (Test-Path ".env") {
  Get-Content ".env" | ForEach-Object {
    if ($_ -match "^\s*([^#][^=]*)=(.*)$") {
      [System.Environment]::SetEnvironmentVariable($matches[1].Trim(), $matches[2].Trim(), "Process")
    }
  }
  Ok "Loaded environment from .env"
}

# ─────────────────────────────────────
# 6. Dependencies
# ─────────────────────────────────────
Log "Installing dependencies..."
pnpm install --frozen-lockfile 2>&1 | Select-Object -Last 5
Ok "Dependencies installed"

# ─────────────────────────────────────
# 7. Database migrations
# ─────────────────────────────────────
Log "Running database migrations..."
$migrateResult = pnpm --filter @workspace/db run push 2>&1
if ($LASTEXITCODE -ne 0) {
  Write-Host $migrateResult
  Fail "Migration failed. Check DATABASE_URL in .env and ensure Postgres is running.`n  Then re-run: pnpm --filter @workspace/db run push"
}
Ok "Database schema up to date"

Log "Seed: none required — Deck OS auto-seeds all tables on first API server start."
Ok "Seed step skipped (handled by API bootstrap)"

# ─────────────────────────────────────
# 8. Done / optional start
# ─────────────────────────────────────
Write-Host ""
Write-Host "  Setup complete!" -ForegroundColor Green
Write-Host ""

if ($Start) {
  Log "Starting dev servers..."
  Write-Host "  API server -> http://localhost:8080"
  Write-Host "  Deck OS    -> http://localhost:5173"
  Write-Host "  Press Ctrl+C to stop both servers"
  Write-Host ""

  $apiJob = Start-Job -ScriptBlock {
    Set-Location $using:PWD
    $env:PORT = "8080"
    pnpm --filter @workspace/api-server run dev
  }
  $webJob = Start-Job -ScriptBlock {
    Set-Location $using:PWD
    $env:PORT = "5173"
    $env:BASE_PATH = "/"
    pnpm --filter @workspace/deck-os run dev
  }

  try {
    while ($true) {
      Receive-Job -Job $apiJob -Keep | Write-Host
      Receive-Job -Job $webJob -Keep | Write-Host
      Start-Sleep -Milliseconds 500
    }
  } finally {
    Stop-Job -Job $apiJob, $webJob
    Remove-Job -Job $apiJob, $webJob
  }
} else {
  Write-Host "  To start Deck OS manually:"
  Write-Host ""
  Write-Host "    # API server (uses PORT from .env):"
  Write-Host "    pnpm --filter @workspace/api-server run dev"
  Write-Host ""
  Write-Host "    # Frontend:"
  Write-Host '    $env:PORT = "5173"; $env:BASE_PATH = "/"; pnpm --filter @workspace/deck-os run dev'
  Write-Host ""
  Write-Host "  Or run both at once:"
  Write-Host ""
  Write-Host "    .\setup.ps1 -Start"
  Write-Host ""
}
