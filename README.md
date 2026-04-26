# Deck OS — JARVIS Command Center

A local-first AI command center inspired by Iron Man's JARVIS. Deck OS runs entirely on your machine using Ollama for private, offline AI inference — no cloud required.

---

## Quick Start

### Option A — Docker Compose (recommended, ~3 minutes)

> Requires [Docker Desktop](https://www.docker.com/products/docker-desktop) (Windows/Mac/Linux)

```bash
# 1. Clone and enter the repo
git clone https://github.com/your-username/deck-os.git
cd deck-os

# 2. Copy the environment template (edit to add optional API keys)
cp .env.example .env

# 3. Start everything
bash setup.sh --docker        # Linux / macOS
.\setup.ps1 -Docker           # Windows PowerShell
```

That's it. Docker builds the API server and frontend, starts PostgreSQL, and runs DB migrations automatically.

| Service    | URL                       |
|------------|---------------------------|
| Frontend   | http://localhost:3000     |
| API server | http://localhost:8080     |

**Useful Docker commands:**
```bash
docker compose logs -f          # Follow all logs
docker compose logs -f api      # API server logs only
docker compose down             # Stop everything
docker compose down -v          # Stop + erase database volume
```

---

### Option B — Bare-Metal (for development)

> Requires: Node.js 20+, pnpm, PostgreSQL 14+

```bash
# Linux / macOS
bash setup.sh           # Check prerequisites, install deps, run migrations
bash setup.sh --start   # Same as above, then start API + frontend together

# Windows PowerShell
.\setup.ps1             # Check prerequisites, install deps, run migrations
.\setup.ps1 -Start      # Same as above, then start API + frontend together
```

> **Note:** Setup does not auto-start the servers. Pass `--start` / `-Start` when
> you want a one-shot "set up and run" experience. For day-to-day development,
> starting API and frontend in separate terminals (so you can see each log stream
> independently) is usually more convenient.

The script automatically:
- Checks Node.js 20+ and pnpm (installs pnpm via corepack if missing)
- Detects a running PostgreSQL instance and creates the `deckos` DB/user
- Detects Ollama and prints model pull commands
- Copies `.env.example` → `.env` (prompts to edit before continuing)
- Runs `pnpm install` and applies DB migrations (`drizzle-kit push`)

After setup, services are available at:

| Service    | URL                       |
|------------|---------------------------|
| Frontend   | http://localhost:5173     |
| API server | http://localhost:8080     |

**Start dev servers manually:**
```bash
# API server
pnpm --filter @workspace/api-server run dev

# Frontend (separate terminal)
PORT=5173 BASE_PATH=/ pnpm --filter @workspace/deck-os run dev
```

---

## Local AI (Ollama)

Deck OS uses [Ollama](https://ollama.com) for private, local AI inference. Install Ollama, then pull the two default models:

```bash
ollama pull gemma3:9b   # CORTEX — chat, reasoning, planning
ollama pull phi3        # REFLEX  — fast classification, commands
```

Deck OS runs in rule-engine fallback mode if Ollama is unavailable. You can swap models any time in **Settings → AI Config** inside the app.

---

## Environment Variables

Copy `.env.example` to `.env` before running. Key settings:

| Variable           | Required | Description                                       |
|--------------------|----------|---------------------------------------------------|
| `DATABASE_URL`     | Yes      | PostgreSQL connection string                      |
| `REASONING_MODEL`  | No       | Ollama model for deep reasoning (default: gemma3:9b) |
| `FAST_MODEL`       | No       | Ollama model for fast tasks (default: phi3)       |
| `OLLAMA_HOST`      | No       | Ollama URL (default: http://localhost:11434)       |
| `OPENAI_API_KEY`   | No       | Enables Whisper STT, vision, cloud LLM fallback   |
| `ELEVENLABS_API_KEY` | No     | Enables text-to-speech voice output               |
| `MQTT_BROKER_URL`  | No       | MQTT broker for IoT device integration            |
| `SESSION_SECRET`   | No       | Secret for session cookies (auto-generated)       |

See `.env.example` for the full list with descriptions.

---

## Features

- **AI Command Console** — Chat with JARVIS via text or voice; streaming responses
- **3-Tier Model Routing** — CORTEX (deep reasoning) · REFLEX (fast) · AUTOPILOT (offline rule engine)
- **Self-Upgrade** — JARVIS adjusts its personality dials in response to your instructions
- **Personality Dials** — Fine-tune gravity, snarkiness, and warmth sliders
- **Device Dashboard** — MQTT/WebSocket IoT sensor monitoring with live charts
- **Memory Bank** — Short-term and long-term memory with keyword search
- **Goal Manager** — Create and track goals with AI-generated step-by-step plans
- **Daily Briefing** — AI-generated summary of the past 24 hours, auto-scheduled at 06:00
- **Autonomous Layer** — Routine scheduling with safety levels (strict/moderate/permissive)
- **Spatial Map** — Live device tracking with geofencing
- **Voice TTS/STT** — ElevenLabs TTS and OpenAI Whisper STT (optional API keys)
- **Plugin System** — Dynamically-loaded esbuild plugins (system_monitor, ai_chat)

---

## Architecture

```
deck-os/
├── artifacts/
│   ├── api-server/      Express 5 + Drizzle + PostgreSQL + WebSocket
│   ├── deck-os/         React + Vite + TailwindCSS (main dashboard)
│   ├── deck-mobile/     React PWA mobile chat interface
│   └── deck-cli/        Node.js interactive CLI (REPL + daemon mode)
├── lib/
│   ├── db/              Drizzle schema + migrations
│   ├── event-bus/       Async non-blocking EventBus
│   └── api-zod/         Shared Zod schemas (API contracts)
├── docker-compose.yml   Full local stack (Postgres + API + frontend)
├── setup.sh             Linux/macOS setup script
└── setup.ps1            Windows PowerShell setup script
```

---

## Requirements

| Tool        | Minimum | Notes                                   |
|-------------|---------|------------------------------------------|
| Node.js     | 20      | LTS recommended — https://nodejs.org    |
| pnpm        | 8       | Auto-installed by setup script           |
| PostgreSQL  | 14      | Or use Docker Compose                    |
| Docker      | 24      | Only for the `--docker` path             |
| Ollama      | any     | Optional — https://ollama.com            |

---

## License

MIT
