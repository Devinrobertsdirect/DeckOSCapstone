#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Deck OS — Local Setup Script
# Supports Linux and macOS (bash 4+)
# Usage: bash setup.sh [--start]   (--start also starts the dev servers)
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

BOLD="\033[1m"; GREEN="\033[32m"; YELLOW="\033[33m"; RED="\033[31m"; CYAN="\033[36m"; RESET="\033[0m"

log()  { echo -e "${BOLD}${CYAN}[deck-os]${RESET} $*"; }
ok()   { echo -e "${GREEN}  ✓${RESET} $*"; }
warn() { echo -e "${YELLOW}  ⚠${RESET} $*"; }
fail() { echo -e "${RED}  ✗ ERROR:${RESET} $*" >&2; exit 1; }

START_SERVERS=false
for arg in "$@"; do
  [[ "$arg" == "--start" ]] && START_SERVERS=true
done

echo ""
echo -e "${BOLD}${CYAN}  ██████╗ ███████╗ ██████╗██╗  ██╗     ██████╗ ███████╗${RESET}"
echo -e "${BOLD}${CYAN}  ██╔══██╗██╔════╝██╔════╝██║ ██╔╝    ██╔═══██╗██╔════╝${RESET}"
echo -e "${BOLD}${CYAN}  ██║  ██║█████╗  ██║     █████╔╝     ██║   ██║███████╗${RESET}"
echo -e "${BOLD}${CYAN}  ██║  ██║██╔══╝  ██║     ██╔═██╗     ██║   ██║╚════██║${RESET}"
echo -e "${BOLD}${CYAN}  ██████╔╝███████╗╚██████╗██║  ██╗    ╚██████╔╝███████║${RESET}"
echo -e "${BOLD}${CYAN}  ╚═════╝ ╚══════╝ ╚═════╝╚═╝  ╚═╝     ╚═════╝ ╚══════╝${RESET}"
echo ""
log "JARVIS Command Center — Local Setup"
echo ""

# ─────────────────────────────────────
# 1. Node.js
# ─────────────────────────────────────
log "Checking Node.js..."
if ! command -v node &>/dev/null; then
  fail "Node.js not found. Install Node.js 18+ from https://nodejs.org"
fi
NODE_VERSION=$(node --version | sed 's/v//')
NODE_MAJOR=$(echo "$NODE_VERSION" | cut -d. -f1)
if [[ "$NODE_MAJOR" -lt 18 ]]; then
  fail "Node.js 18+ required (found v${NODE_VERSION}). Upgrade from https://nodejs.org"
fi
ok "Node.js v${NODE_VERSION}"

# ─────────────────────────────────────
# 2. pnpm
# ─────────────────────────────────────
log "Checking pnpm..."
if ! command -v pnpm &>/dev/null; then
  warn "pnpm not found. Installing via corepack..."
  corepack enable
  corepack prepare pnpm@latest --activate || npm install -g pnpm
fi
PNPM_VERSION=$(pnpm --version)
ok "pnpm v${PNPM_VERSION}"

# ─────────────────────────────────────
# 3. PostgreSQL
# ─────────────────────────────────────
log "Checking PostgreSQL..."
if command -v pg_isready &>/dev/null; then
  if pg_isready -q 2>/dev/null; then
    ok "PostgreSQL is running"
  else
    warn "PostgreSQL found but not responding. Make sure it is started:"
    warn "  macOS (Homebrew):   brew services start postgresql@16"
    warn "  Linux (systemd):    sudo systemctl start postgresql"
    warn "  Docker:             docker-compose up -d postgres"
  fi
elif command -v psql &>/dev/null; then
  warn "psql found but pg_isready not in PATH. Assuming Postgres is available."
else
  warn "PostgreSQL client tools not found."
  warn "Install:  brew install postgresql@16  (macOS)"
  warn "          sudo apt install postgresql  (Ubuntu/Debian)"
  warn "          Or use Docker: docker-compose up -d postgres"
fi

# ─────────────────────────────────────
# 4. Ollama (optional)
# ─────────────────────────────────────
log "Checking Ollama (optional)..."
if command -v ollama &>/dev/null; then
  OLLAMA_VER=$(ollama --version 2>/dev/null | head -1 || echo "unknown")
  ok "Ollama found: ${OLLAMA_VER}"
  if ! curl -s --max-time 2 http://localhost:11434/api/tags &>/dev/null; then
    warn "Ollama is installed but not running."
    warn "Start it with:  ollama serve"
  else
    ok "Ollama is running"
    log "  Tip: pull the default models if you haven't already:"
    echo "       ollama pull gemma3:9b"
    echo "       ollama pull phi3"
  fi
else
  warn "Ollama not found. Deck OS will run in rule-engine fallback mode."
  warn "Install from: https://ollama.com"
fi

# ─────────────────────────────────────
# 5. .env file
# ─────────────────────────────────────
log "Setting up environment..."
if [[ ! -f .env ]]; then
  cp .env.example .env
  ok "Created .env from .env.example"
  warn "Edit .env and set DATABASE_URL before continuing."
  echo ""
  read -r -p "  Press ENTER after editing .env to continue, or Ctrl+C to stop now: "
else
  ok ".env already exists (skipping copy)"
fi

# ─────────────────────────────────────
# 6. Dependencies
# ─────────────────────────────────────
log "Installing dependencies..."
pnpm install --frozen-lockfile 2>&1 | tail -5
ok "Dependencies installed"

# ─────────────────────────────────────
# 7. Database migrations
# ─────────────────────────────────────
log "Running database migrations..."
if pnpm --filter @workspace/db run db:push 2>&1; then
  ok "Database schema up to date"
else
  warn "Migration failed. Check DATABASE_URL in .env and ensure Postgres is running."
  warn "Then re-run: pnpm --filter @workspace/db run db:push"
fi

# ─────────────────────────────────────
# 8. Done / optional start
# ─────────────────────────────────────
echo ""
echo -e "${GREEN}${BOLD}  ✓ Setup complete!${RESET}"
echo ""

if [[ "$START_SERVERS" == true ]]; then
  log "Starting dev servers..."
  echo "  API server → http://localhost:8080"
  echo "  Deck OS    → http://localhost:5173"
  echo ""
  pnpm --parallel --filter @workspace/api-server --filter @workspace/deck-os run dev
else
  echo "  To start Deck OS:"
  echo ""
  echo "    pnpm --parallel --filter @workspace/api-server --filter @workspace/deck-os run dev"
  echo ""
  echo "  Or run everything at once:"
  echo ""
  echo "    bash setup.sh --start"
  echo ""
fi
