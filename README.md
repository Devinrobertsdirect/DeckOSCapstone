# Deck OS — JARVIS Command Center

A local-first AI command center inspired by Iron Man's JARVIS. Deck OS runs entirely on your machine using Ollama for private, offline AI inference — no cloud required.

---

## Table of Contents

1. [Quick Start](#quick-start)
2. [Updating](#updating)
3. [Local AI (Ollama)](#local-ai-ollama)
4. [Environment Variables](#environment-variables)
5. [Features](#features)
6. [Architecture](#architecture)
7. [Plugin System](#plugin-system)
   - [How Plugins Work](#how-plugins-work)
   - [Writing a Community Plugin](#writing-a-community-plugin)
   - [Sandbox API Reference](#sandbox-api-reference)
   - [Testing Your Plugin Locally](#testing-your-plugin-locally)
   - [Publishing to the Marketplace](#publishing-to-the-marketplace)
   - [Registry Entry Format](#registry-entry-format)
   - [Built-in Plugins (TypeScript)](#built-in-plugins-typescript)
8. [EventBus Event Types](#eventbus-event-types)
9. [WebSocket API](#websocket-api)
10. [Troubleshooting](#troubleshooting)
11. [Requirements](#requirements)
12. [License](#license)

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

## Updating

After pulling new code, run the update script instead of manually re-running each step:

```bash
# Linux / macOS
bash update.sh            # git pull + install deps + DB migrations
bash update.sh --no-pull  # skip git pull (already done manually)
bash update.sh --docker   # Docker Compose: pull new images + rebuild

# Windows PowerShell
.\update.ps1              # git pull + install deps + DB migrations
.\update.ps1 -NoPull      # skip git pull (already done manually)
.\update.ps1 -Docker      # Docker Compose: pull new images + rebuild
```

The script handles the three steps that are easy to forget in the right order:
1. `git pull` — fetch latest code (skip with `--no-pull` / `-NoPull`)
2. `pnpm install --frozen-lockfile` — sync new/changed packages
3. `pnpm --filter @workspace/db run push` — apply any new DB migrations

Then restart your dev servers to pick up the changes.

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

| Variable             | Required | Description                                              |
|----------------------|----------|----------------------------------------------------------|
| `DATABASE_URL`       | Yes      | PostgreSQL connection string                             |
| `REASONING_MODEL`    | No       | Ollama model for deep reasoning (default: `gemma3:9b`)   |
| `FAST_MODEL`         | No       | Ollama model for fast tasks (default: `phi3`)            |
| `OLLAMA_HOST`        | No       | Ollama URL (default: `http://localhost:11434`)            |
| `OPENAI_API_KEY`     | No       | Enables Whisper STT, vision, and cloud LLM fallback      |
| `ELEVENLABS_API_KEY` | No       | Enables text-to-speech voice output                      |
| `MQTT_BROKER_URL`    | No       | MQTT broker for IoT device integration                   |
| `MQTT_BROKER_USER`   | No       | MQTT broker username                                     |
| `MQTT_BROKER_PASS`   | No       | MQTT broker password                                     |
| `SESSION_SECRET`     | No       | Secret for session cookies (auto-generated if unset)     |
| `PLUGIN_REGISTRY_URL`| No       | URL to a custom plugin registry JSON (overrides local `registry.json`) |

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
- **ACERA Connect** — MediaPipe hand-tracking gesture control (enable in Settings → Vision)
- **Plugin System** — Dynamically-loaded community plugins run in isolated worker sandboxes

---

## Architecture

```
deck-os/
├── artifacts/
│   ├── api-server/      Express 5 + Drizzle + PostgreSQL + WebSocket
│   │   ├── src/
│   │   │   ├── plugins/         Built-in TypeScript plugins (system_monitor, ai_chat)
│   │   │   ├── lib/
│   │   │   │   ├── plugin-registry.ts  Plugin loader + sandbox manager
│   │   │   │   └── community-plugin-worker.ts  Worker sandbox host
│   │   │   └── routes/store.ts  Plugin Store REST API
│   │   ├── community-plugins/   Downloaded community plugin .mjs files
│   │   └── registry.json        Local plugin registry (used if PLUGIN_REGISTRY_URL is unset)
│   ├── deck-os/         React + Vite + TailwindCSS (main dashboard)
│   ├── deck-mobile/     React PWA mobile chat interface
│   └── deck-cli/        Node.js interactive CLI (REPL + daemon mode)
├── lib/
│   ├── db/              Drizzle schema + migrations
│   ├── event-bus/       Async non-blocking EventBus + Plugin base class
│   └── api-zod/         Shared Zod schemas (API contracts)
├── docker-compose.yml   Full local stack (Postgres + API + frontend)
├── setup.sh             Linux/macOS first-time setup script
├── setup.ps1            Windows first-time setup script
├── update.sh            Linux/macOS one-command update script
└── update.ps1           Windows one-command update script
```

---

## Plugin System

Deck OS has two plugin tiers:

| Tier | Language | Isolation | When to use |
|------|----------|-----------|-------------|
| **Built-in** | TypeScript, compiled with esbuild | Same process | Core system features; full DB/inference access |
| **Community** | Plain JavaScript ESM (`.mjs`) | Worker thread sandbox | Third-party extensions distributed via the store |

This guide covers community plugins — the kind you write and publish to the marketplace.

---

### How Plugins Work

When Deck OS starts, it:

1. Scans `dist/plugins/` and loads every `.mjs` file as a **built-in** plugin directly in the main process.
2. Queries the database for all enabled community plugins and re-downloads any whose local `.mjs` file is missing.
3. Spawns each community plugin in its own **Node.js Worker thread** via `community-plugin-worker.mjs`. The worker can only communicate with the main process through a message-passing protocol — it cannot `require` arbitrary modules or touch the filesystem directly.

The Plugin Store UI (in **Settings → Store**) browses the registry, installs plugins by downloading their `.mjs` from an approved CDN, and hot-loads them without restarting the server.

---

### Writing a Community Plugin

A community plugin is a single self-contained ESM JavaScript file that exports a default class (or plain object) with five required fields and four required methods.

#### Minimal template

```javascript
// my_plugin/index.mjs

export default class MyPlugin {
  // ── Required identity fields ───────────────────────────────────────────────
  id          = "my_plugin";        // Snake-case, a-z0-9_-, max 64 chars
  name        = "My Plugin";        // Human-readable display name
  version     = "1.0.0";           // SemVer string
  description = "Does something useful.";
  category    = "productivity";     // monitoring | productivity | ai | iot | utilities

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  /**
   * Called once when the plugin is loaded.
   * Set up timers, subscribe to events, and register HTTP routes here.
   * @param {PluginContext} ctx
   */
  async init(ctx) {
    this._ctx = ctx;
    ctx.logger.info("MyPlugin: started");
  }

  /**
   * Called for every EventBus event the plugin has subscribed to.
   * Alternatively, use ctx.subscribe() inside init() for per-type handlers.
   * @param {BusEvent} event
   */
  async on_event(event) {
    // handle event
  }

  /**
   * Called when the user or another plugin triggers this plugin via the REST API.
   * POST /api/plugins/my_plugin/execute  { command: "ping", args: {} }
   * Must return a JSON-serialisable value.
   * @param {{ command?: string, args?: Record<string, unknown> }} payload
   */
  async execute(payload) {
    if (payload?.command === "ping") return { pong: true };
    return { error: "Unknown command" };
  }

  /**
   * Called when the plugin is disabled or the server shuts down.
   * Clear all timers and release resources here.
   */
  async shutdown() {
    ctx.logger.info("MyPlugin: stopped");
  }
}
```

#### Important rules

- The `id` field **must match** the `id` in the registry entry exactly. The sandbox validates this and rejects mismatches to prevent ID spoofing.
- `id` must match `/^[a-z][a-z0-9_-]{0,63}$/` — lowercase letters, digits, underscores, hyphens only; max 64 characters; must start with a letter.
- Your plugin file must be valid ES module syntax (i.e. `export default class ...`). CommonJS (`module.exports`) is not supported.
- Do not use top-level `await` outside of `init()`. The worker will call `init()` after instantiation.
- You cannot `import` or `require` external npm packages inside a community plugin — the sandbox does not have access to `node_modules`. Use the built-in `fetch` API for network calls, or use the `ctx.infer` RPC for AI inference.

---

### Sandbox API Reference

Inside `init()`, `on_event()`, and `execute()` you receive a `ctx` object with the following methods:

#### `ctx.emit(event)`

Emit an event to the global EventBus. All other plugins and internal services will receive it.

```javascript
ctx.emit({
  source: `plugin.${this.id}`,   // Convention: "plugin.<your_id>"
  target: null,                   // null = broadcast; string = specific target
  type: "my_plugin.something_happened",
  payload: { value: 42 },
});
```

#### `ctx.subscribe(eventType, handler)`

Subscribe to a specific event type. Use `"*"` to receive every event on the bus.
Returns a subscription ID string (you can ignore it — the sandbox cleans up on shutdown).

```javascript
ctx.subscribe("system.shutdown", async (event) => {
  await this.shutdown();
});

ctx.subscribe("my_plugin.configure", (event) => {
  const { interval } = event.payload ?? {};
  if (typeof interval === "number") this._interval = interval;
});
```

#### `ctx.logger`

Structured logger. Output appears in the API server's pino log stream tagged with your plugin ID.

```javascript
ctx.logger.info("Plugin started");
ctx.logger.warn("Retrying fetch...", { url, attempt });
ctx.logger.error("Failed to connect", { err: error.message });
```

#### `ctx.infer(opts)` → `Promise<{ text: string }>`

Run a prompt through Deck OS's 3-tier AI router (Ollama → cloud fallback → rule engine). This counts against your user's Ollama context — use sparingly.

```javascript
const result = await ctx.infer({
  prompt: "Summarise this in one sentence: " + rawText,
  model: "fast",          // "fast" | "reasoning" — optional, defaults to "fast"
  systemPrompt: "...",    // optional
});
ctx.logger.info("AI says: " + result.text);
```

#### `ctx.memory`

Read and write entries to JARVIS's long-term memory store (PostgreSQL-backed).

```javascript
// Store a memory
await ctx.memory.store({
  type: "long_term",               // "short_term" | "long_term"
  content: "User prefers dark mode at night",
  keywords: ["preference", "display", "dark"],
  source: this.id,
});

// Keyword search
const results = await ctx.memory.search("dark mode", 5);
// results: Array<{ id, content, keywords, createdAt, ... }>

// Fetch recent memories
const recent = await ctx.memory.getRecent(10);

// Fetch a specific memory by ID
const entry = await ctx.memory.getById("uuid-here");

// Purge expired short-term memories
await ctx.memory.expire();
```

#### `ctx.http.register(method, pattern, handler)`

Register an HTTP sub-route under `/api/plugins/<your_id>/<pattern>`. The Deck OS API server proxies matching requests to your worker via message passing.

```javascript
ctx.http.register("GET", "/status", async (req) => {
  return {
    status: 200,
    body: { running: true, lastPoll: this._lastPollAt },
  };
});

ctx.http.register("POST", "/configure", async (req) => {
  const { lat, lon } = req.body ?? {};
  this._lat = lat ?? this._lat;
  this._lon = lon ?? this._lon;
  return { status: 200, body: { ok: true } };
});
```

`req` has the shape `{ body, query, params, headers }`. Routes time out after 30 seconds.
After registering `GET /status`, the route is reachable at:
```
GET http://localhost:8080/api/plugins/my_plugin/status
```

---

### Testing Your Plugin Locally

You have two options for local testing before publishing.

#### Option 1 — Sideload from disk (fastest)

1. Place your compiled `.mjs` file in `artifacts/api-server/community-plugins/`:
   ```bash
   cp my_plugin/index.mjs artifacts/api-server/community-plugins/my_plugin.mjs
   ```
2. Insert a row into the database to register it as "installed":
   ```sql
   INSERT INTO community_plugins (plugin_id, name, author, description, version, category, permissions, enabled)
   VALUES ('my_plugin', 'My Plugin', 'your-username', 'Does something useful.', '1.0.0', 'productivity', '[]', true);
   ```
3. Restart the API server — it will load the local file automatically at startup:
   ```bash
   pnpm --filter @workspace/api-server run dev
   ```
4. Verify it loaded:
   ```bash
   curl http://localhost:8080/api/plugins/store/installed
   # Should include your plugin with "enabled": true
   ```

#### Option 2 — Install via store API with a local registry

1. Add your plugin entry to `artifacts/api-server/registry.json` (see the [Registry Entry Format](#registry-entry-format) section below). Set `entrypointUrl` to a raw GitHub URL or a local file-serving URL.
2. Hit the install endpoint:
   ```bash
   curl -X POST http://localhost:8080/api/plugins/store/install/my_plugin
   ```
3. Check runtime status:
   ```bash
   curl http://localhost:8080/api/plugins
   # Look for your plugin in the list with status "active"
   ```

#### Invoke your plugin

```bash
# Trigger execute() with a command
curl -X POST http://localhost:8080/api/plugins/my_plugin/execute \
  -H "Content-Type: application/json" \
  -d '{"command":"ping"}'

# Hit a registered HTTP sub-route
curl http://localhost:8080/api/plugins/my_plugin/status
```

#### Read server logs

All `ctx.logger.*` calls appear in the API server log stream tagged with your plugin ID:
```
[INFO] [community:my_plugin] Plugin started
```

Follow live logs:
```bash
# Bare-metal
pnpm --filter @workspace/api-server run dev

# Docker
docker compose logs -f api
```

---

### Publishing to the Marketplace

The Deck OS plugin marketplace is a `registry.json` file hosted on GitHub. Publishing means opening a pull request to add your entry to the community registry repository.

#### Step 1 — Prepare your plugin file

Your plugin must be a single self-contained ESM file. If you write it in TypeScript or use multiple source files, bundle it first:

```bash
# Using esbuild (recommended — same bundler as Deck OS itself)
npx esbuild src/index.ts \
  --bundle \
  --format=esm \
  --platform=node \
  --outfile=dist/index.mjs \
  --external:node:* \
  --minify
```

> **Important:** Only `node:*` built-ins are available inside the sandbox. Do not bundle node_modules that require native binaries (`.node` files), spawn child processes, or access the filesystem outside of the Node.js built-in APIs. Such plugins will fail to load.

Test the bundled output locally (Option 1 or 2 above) before publishing.

#### Step 2 — Host your plugin file on an approved CDN

The Deck OS server only downloads plugin files from a hard-coded allowlist of trusted origins:

| Approved origin | Example URL format |
|---|---|
| `https://raw.githubusercontent.com` | `https://raw.githubusercontent.com/<user>/<repo>/main/<plugin>/index.mjs` |
| `https://cdn.jsdelivr.net` | `https://cdn.jsdelivr.net/gh/<user>/<repo>@<tag>/<plugin>/index.mjs` |
| `https://unpkg.com` | `https://unpkg.com/<package>@<version>/dist/index.mjs` |

**Recommended approach — GitHub raw URL:**

1. Create a public GitHub repo (e.g. `github.com/yourname/deck-os-plugins`).
2. Commit your bundled `index.mjs` to it (e.g. `my_plugin/index.mjs`).
3. Your `entrypointUrl` will be:
   ```
   https://raw.githubusercontent.com/yourname/deck-os-plugins/main/my_plugin/index.mjs
   ```

**Tip:** Pin to a tag rather than `main` for stability:
```
https://raw.githubusercontent.com/yourname/deck-os-plugins/v1.0.0/my_plugin/index.mjs
```

#### Step 3 — Create your registry entry

Write a JSON object that describes your plugin (see [Registry Entry Format](#registry-entry-format) below).

#### Step 4 — Open a pull request to the community registry

1. Fork the official registry repository:
   ```
   https://github.com/deck-os/community-plugins
   ```
2. Edit `registry.json` and add your plugin object to the `plugins` array.
3. Commit and open a pull request. Your PR title should be:
   ```
   feat: add <your_plugin_id> plugin
   ```
4. The maintainers will review your plugin for:
   - Correct `id` format and uniqueness
   - Valid `entrypointUrl` from an approved CDN
   - Plugin actually loads without errors (automated CI check)
   - No malicious behaviour, network calls to unexpected hosts, or filesystem abuse
5. Once merged, your plugin appears in every user's Plugin Store within 5 minutes (the server caches the registry for 5 minutes).

#### Step 5 — Updating your plugin

To release a new version:

1. Upload the new bundled `.mjs` to your CDN (same URL or a new tagged URL).
2. Open another PR to the registry updating your entry's `version` field and `entrypointUrl` if the URL changed.
3. Users who already have the plugin installed can update it by clicking **Update** in the Plugin Store, which calls:
   ```bash
   curl -X POST http://localhost:8080/api/plugins/store/install/my_plugin \
     -H "Content-Type: application/json" \
     -d '{"force": true}'
   ```

---

### Registry Entry Format

Each entry in `registry.json` → `plugins[]` must conform to this schema:

```jsonc
{
  // Required fields
  "id": "my_plugin",              // Must match /^[a-z][a-z0-9_-]{0,63}$/ and be globally unique
  "name": "My Plugin",            // Display name shown in the Plugin Store UI
  "author": "community/yourname", // "community/<handle>" for third-party; "deck-os/official" is reserved
  "description": "One paragraph describing what the plugin does.",
  "version": "1.0.0",            // SemVer string — bump this on every update
  "category": "productivity",     // monitoring | productivity | ai | iot | utilities
  "permissions": ["network"],     // Declared permissions (informational — shown to users before install)
  "tags": ["timer", "focus"],     // Array of lowercase search tags
  "iconUrl": null,                // null, or https:// URL to a square icon image
  "entrypointUrl": "https://raw.githubusercontent.com/yourname/deck-os-plugins/main/my_plugin/index.mjs",
  "installCount": 0,              // Start at 0; the registry maintainers update this periodically
  "readme": "Full Markdown readme shown on the plugin detail page."
}
```

**Permissions** are informational strings shown to users before they install. Use them to declare what your plugin does. Current convention:

| Permission string | Meaning |
|---|---|
| `network` | Makes outbound HTTP/HTTPS requests |
| `ai_inference` | Calls `ctx.infer()` to use local AI |
| `memory_read` | Reads from JARVIS memory store |
| `memory_write` | Writes to JARVIS memory store |
| `notifications` | Emits `notification.created` events |
| `tts` | Emits `tts.speak` events (requires ElevenLabs key) |
| `device_read` | Reads device state from the device registry |
| `device_control` | Sends commands to devices |
| `system_stats` | Reads system CPU/memory/disk metrics |

---

### Built-in Plugins (TypeScript)

Built-in plugins live in `artifacts/api-server/src/plugins/` and are compiled into `dist/plugins/` by the esbuild build step. They run in the main process (no sandbox) and have full access to the database, file system, and all internal services.

To add a built-in plugin:

1. Create `artifacts/api-server/src/plugins/my_plugin.ts`.
2. Export a default class that extends `Plugin` from `@workspace/event-bus`:
   ```typescript
   import { Plugin } from "@workspace/event-bus";
   import type { PluginContext, BusEvent } from "@workspace/event-bus";

   export default class MyPlugin extends Plugin {
     readonly id          = "my_plugin";
     readonly name        = "My Plugin";
     readonly version     = "1.0.0";
     readonly description = "Does something useful.";
     readonly category    = "monitoring";

     async init(context: PluginContext): Promise<void> {
       context.logger.info("MyPlugin: started");
     }

     async on_event(_event: BusEvent): Promise<void> {}

     async execute(payload: unknown): Promise<unknown> {
       return { ok: true };
     }

     async shutdown(): Promise<void> {
       // cleanup
     }
   }
   ```
3. The plugin is auto-discovered from `dist/plugins/` on startup — no registration step needed.
4. Add a corresponding entry to `registry.json` with `"author": "deck-os/official"` and `"entrypointUrl": null` (built-ins are not downloaded from a URL).

---

## EventBus Event Types

All internal communication in Deck OS flows through the async EventBus. Plugins can subscribe to and emit any of these types.

| Type | Direction | Payload |
|---|---|---|
| `chat.message` | API → bus | `{ role, content, sessionId }` |
| `chat.response` | bus → clients | `{ content, model, sessionId }` |
| `system.monitor.metrics` | system_monitor → bus | `{ cpu, memory, disk, network, uptime }` |
| `system.monitor.request` | any → system_monitor | `{ replyTo? }` |
| `system.resource.alert` | system_monitor → bus | `{ resource, value, threshold, message }` |
| `system.resource.clear` | system_monitor → bus | `{ resource, value, threshold }` |
| `weather.update` | weather_monitor → bus | `{ temperature, windSpeed, humidity, weatherCode, ... }` |
| `notification.created` | any → bus | `{ title, message, severity, pluginId }` |
| `plugin.loaded` | registry → bus | `{ pluginId, name, version, sandboxed? }` |
| `plugin.unloaded` | registry → bus | `{ pluginId }` |
| `plugin.error` | registry → bus | `{ pluginId, error }` |
| `plugin.installed` | store → bus | `{ pluginId, name, version }` |
| `plugin.uninstalled` | store → bus | `{ pluginId }` |
| `plugin.status_changed` | store/registry → bus | `{ pluginId, enabled }` |
| `device.reading` | device → bus | `{ deviceId, type, value, unit, timestamp }` |
| `device.command` | any → bus | `{ deviceId, command, args }` |
| `device.connected` | transport → bus | `{ deviceId }` |
| `device.disconnected` | transport → bus | `{ deviceId }` |
| `tts.speak` | any → bus | `{ text, voice?, priority? }` |
| `acera.gesture.detected` | acera → bus | `{ gesture, confidence, hand }` |
| `acera.scene.update` | acera → bus | `{ hands, gestures, timestamp }` |
| `acera.tracking.started` | acera → bus | `{}` |
| `acera.tracking.stopped` | acera → bus | `{}` |
| `system.shutdown` | server → bus | `{}` |
| `routine.triggered` | routine-runner → bus | `{ routineId, name }` |
| `goal.created` | any → bus | `{ goalId, title }` |
| `goal.completed` | any → bus | `{ goalId, title }` |
| `briefing.ready` | briefing → bus | `{ content, generatedAt }` |
| `memory.stored` | memory-service → bus | `{ id, type, keywords }` |
| `cognitive.loop.tick` | cognitive-loop → bus | `{ tickAt }` |

---

## WebSocket API

Connect to `ws://localhost:8080/api/ws` to receive real-time EventBus events in the frontend or any external client.

**Subscribe to event types:**
```json
{ "type": "subscribe", "eventTypes": ["system.monitor.metrics", "device.reading"] }
```

**Unsubscribe:**
```json
{ "type": "unsubscribe", "eventTypes": ["system.monitor.metrics"] }
```

**Emit an event (authenticated clients only):**
```json
{ "type": "emit", "event": { "source": "client", "target": null, "type": "system.monitor.request", "payload": {} } }
```

The server validates all emitted events against the `EventTypeSchema`. Unknown types are rejected with a `validation.error` message.

---

## Troubleshooting

### "Connection refused: Not authorized" in server logs

This is the MQTT broker auth error. It means `MQTT_BROKER_URL` is set in your `.env` but `MQTT_BROKER_USER` / `MQTT_BROKER_PASS` are missing or wrong. Either:
- Set the correct credentials for your HiveMQ Cloud (or other) broker.
- Remove `MQTT_BROKER_URL` from `.env` to disable MQTT entirely.

This error is benign — all other features continue working without MQTT.

### Ollama model not found

```
error loading model: open .../gemma3:9b: no such file or directory
```

Pull the model:
```bash
ollama pull gemma3:9b
ollama pull phi3
```

Deck OS falls back to the rule engine automatically if no model is available.

### Frontend shows blank screen / can't connect to API

1. Confirm the API server is running and listening: `curl http://localhost:8080/api/healthz`
2. Check that `VITE_API_URL` in your `.env` matches the API server address.
3. In Docker: make sure both containers are in the same Compose network (`docker compose ps`).

### Community plugin fails to load ("Worker exited")

- Check the API server log for the error: `[community:<plugin_id>] ...`
- Common causes:
  - Plugin uses `import` / `require` for a package not available in the sandbox (only built-in Node.js modules are available).
  - Plugin `id` field doesn't match the registry `id`.
  - Plugin is not valid ESM (uses CommonJS `module.exports`).
  - `init()` throws an unhandled exception.
- Test with the sideload method first to see errors locally before publishing.

### Database migration fails

```bash
pnpm --filter @workspace/db run push
```

If it still fails, check `DATABASE_URL` in `.env` and ensure PostgreSQL is running:
```bash
psql $DATABASE_URL -c "SELECT 1"
```

---

## Requirements

| Tool        | Minimum | Notes                                    |
|-------------|---------|------------------------------------------|
| Node.js     | 20      | LTS recommended — https://nodejs.org     |
| pnpm        | 8       | Auto-installed by setup script           |
| PostgreSQL  | 14      | Or use Docker Compose                    |
| Docker      | 24      | Only for the `--docker` path             |
| Ollama      | any     | Optional — https://ollama.com            |

---

## License

MIT
