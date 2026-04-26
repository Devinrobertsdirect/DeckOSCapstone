# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.

## Artifacts

### Deck OS — JARVIS Command Center (`artifacts/deck-os`)
- **Port**: 5173
- **Preview Path**: `/`
- Full Iron Man JARVIS-style cyberdeck dashboard
- React + Vite + TailwindCSS, dark-only, JetBrains Mono font
- Pages: Dashboard HUD, AI Router, Plugins, Memory Bank, Cognitive Model, Goal Manager, Feedback Loop, Autonomous Layer, Devices, Command Console
- Nav sections: SYSTEM (6 pages) | COGNITION (4 pages) | Visual Mode selector (sidebar footer)
- Visual Mode system: minimal / standard / cinematic — persisted to localStorage, applied via `data-visual-mode` HTML attribute
- Dashboard: fixed AI.MODE tile overflow, added LIVE badges + timestamps per tile, live console lines, richer SYS.SUMMARY panel
- HUD corners (hud-corner-tl/tr/bl/br): visible only in cinematic mode via CSS
- Cinematic mode: breathing card glow (card-breathe), value flicker, enhanced scanline, nav active glow
- Minimal mode: no scanline, no grid, no glow animations, desaturated palette

### DeckOS CLI (`artifacts/deck-cli`)
- **Binary**: `node artifacts/deck-cli/dist/index.mjs`
- Standalone Node.js CLI tool connecting to the API server via WebSocket (`/api/ws`)
- **Interactive REPL**: readline-based prompt (`deck>`) with color-coded event display using chalk
- **Commands**: `status`, `infer <prompt>`, `mode <mode>`, `devices list`, `memory search <query>`, `plugins list`, `monitor`, `help`, `exit`
- **Daemon mode** (`--daemon`): streams all events as NDJSON to stdout; stderr for connection status
- **Auto-reconnect**: 3s reconnect on disconnect
- **Config**: `WS_URL` env var (default `ws://localhost:PORT/api/ws`)
- **Color scheme**: system=blue, ai=cyan, device=yellow, plugin=green, memory=magenta, ws=gray

### DeckOS Mobile — JARVIS Chat (`artifacts/deck-mobile`)
- **Port**: 26138
- **Preview Path**: `/mobile/`
- Mobile-first PWA chat interface connecting to DeckOS AI
- WebSocket client auto-reconnects to `wss://{host}/api/ws`
- Sends messages via `POST /api/chat` with `channel: "mobile"`
- Shows Voice Identity profile (GET /api/voice-identity)
- PWA-installable (manifest.json, apple-mobile-web-app meta tags)
- JARVIS dark theme matching deck-os aesthetic

### API Server (`artifacts/api-server`)
- **Port**: 8080
- **Preview Path**: `/api`
- Express 5 backend with all Deck OS routes
- **WebSocket**: `ws` package attached at `/api/ws` — broadcasts all EventBus events to connected clients
- **History replay**: On new WebSocket connection, immediately replays last 50 events from `system_events` DB as a `history.replay` batch
- **Command ingestion**: Clients can send `{ type, payload }` JSON over WebSocket; server validates and emits onto the bus. Malformed messages get a `ws.error` response
- **Lifecycle events**: `client.connected` and `client.disconnected` emitted on the bus for each connection
- **Daemon mode**: `--daemon` flag suppresses interactive output and enables JSON-only stdout logging (systemd-compatible)
- **POST /api/chat** — routes through AI inference, writes to memory, emits ai.chat.request/response events, returns `{response, channel, sessionId, latencyMs, modelUsed, fromCache}`
- **GET /api/chat/history** — returns session chat history
- **GET/PUT /api/voice-identity** — manages the Voice Identity profile (tone, pacing, formality, verbosity, emotionRange)
- DB tables added: `chat_messages`, `voice_identity`

## Architecture

### Event Bus (`lib/event-bus`)
Central nervous system for all inter-component communication. All components communicate exclusively through the event bus — never directly.

- **EventBus class**: async, non-blocking processing loop; `emit`, `subscribe`, `unsubscribe`, `history` methods
- **Event envelope**: `id`, `source`, `target`, `type`, `payload`, `timestamp`
- **Event types**: discriminated unions for `system.*`, `plugin.*`, `device.*`, `ai.*`, `memory.*`, `client.*`
- **Client event types added**: `client.connected`, `client.disconnected`
- **Persistence**: fire-and-forget writes to `system_events` DB table
- **Plugin interface**: abstract `Plugin` base class with `init(context)`, `on_event(event)`, `execute(payload)`, `shutdown()`
- **PluginContext**: sandboxed — `emit`, `subscribe`, optional `memory` (PluginMemory), optional `infer` (AI inference fn) exposed
- **Types added**: `PluginMemory`, `MemoryStoreOptions`, `MemoryEntry`, `InferOptions`, `InferResult`

### API Server Bootstrap
- **Bootstrap**: `src/lib/bootstrap.ts` — initializes EventBus singleton, PluginRegistry with memory+infer injection, MemoryService, emits `system.boot`
- **Bus singleton**: `src/lib/bus.ts` — wired to DB persistence via `system_events` table
- **Plugin registry**: `src/lib/plugin-registry.ts` — auto-scans `dist/plugins/` at startup, injects `memory` and `infer` into PluginContext
- **MemoryService**: `src/lib/memory-service.ts` — wraps `memory_entries` table; `store`, `search`, `getRecent`, `getById`, `expire` (TTL timer)
- **Inference module**: `src/lib/inference.ts` — extracted AI inference logic (Ollama, rule-engine, caching) shared by ai-router route and ai_chat plugin
- **Events endpoint**: `GET /api/events/history` — paginated, filterable event history (`?limit`, `?offset`, `?type`, `?source`)
- **Graceful shutdown**: `SIGTERM`/`SIGINT` handlers call `registry.shutdownAll()` + `memoryService.stop()` before closing
- **Plugin build**: `build.mjs` compiles each `src/plugins/*.ts` as a separate esbuild bundle into `dist/plugins/`; `absWorkingDir: artifactDir` required for workspace package resolution

### AI Router Layer
- Detects Ollama at localhost:11434 (auto-refresh every 30s)
- Supports: Ollama local models, llama.cpp, OpenAI-compatible APIs
- Default local models: mistral:instruct, llama3:8b, phi-3-mini
- Falls back to rule-engine when no LLM available
- Response caching (5 min TTL, up to 200 entries)
- Intelligence modes: DIRECT_EXECUTION, LIGHT_REASONING, DEEP_REASONING, HYBRID_MODE

### Plugin System
- Auto-loaded from `dist/plugins/` at startup (each plugin is a separate esbuild bundle)
- 2 production plugins: `system_monitor` (src/plugins/system_monitor.ts), `ai_chat` (src/plugins/ai_chat.ts)
- 5 static API plugins in plugins route (file_manager, device_control, automation_scheduler, plus the above two)
- system_monitor: polls every 5s, emits `system.monitor.metrics`, responds to `system.monitor.request`, writes to long-term memory every 12 polls (60s)
- ai_chat: subscribes to `ai.chat.request`, enriches prompt with memory context, calls AI inference directly (not HTTP), emits `ai.chat.response`, writes exchange to short-term memory
- Plugins receive `memory` (PluginMemory) and `infer` (AI fn) via PluginContext injection from PluginRegistry

### User Cognitive Model (`/api/ucm`)
Structured identity layer — a continuously-updatable model of the user stored separately from event/memory logs.

- **7 layers** (each independently editable/clearable): identity, preferences, context, goals, behaviorPatterns, emotionalModel, domainExpertise
- **Singleton pattern**: one row per database (id=1), JSONB columns per layer
- **API**: `GET /api/ucm` (read), `PATCH /api/ucm/:layer` (merge or replace), `DELETE /api/ucm/:layer` (clear), `DELETE /api/ucm` (full reset)
- **Settings**: `GET /api/ucm/settings`, `PUT /api/ucm/settings` — control knobs: proactiveMode, memoryRetentionLevel (low/medium/high), emotionalModelingEnabled, personalizationLevel (off/minimal/full)
- **Event bus**: emits `memory.stored` on writes, `memory.deleted` on clears, `system.config_changed` on settings changes
- **Frontend**: COG.MODEL nav page with inline key-value editor per layer, collapsible sections, toggle switches for settings

### Goal Manager + Planning Engine (Level 3 + 4, `/api/goals`)
- `goals` table: title, description, status, priority, tags, parentGoalId, completion %, deadline
- `goal_plans` table: step-by-step auto-generated plans with confidence scoring and per-step status tracking
- API: full CRUD `/api/goals`, subgoal support, `POST /api/goals/:id/plan` for auto-plan generation
- Frontend: filterable goal list (active/completed/paused/decayed), goal detail panel, plan step completion tracking
- Route: `/goals` | Nav label: GOALS

### Feedback Loop (Level 5, `/api/feedback`)
- `feedback_signals` table: signalType, weight, context JSON
- `behavior_profile` table: verbosityLevel, proactiveFrequency, toneFormality, confidenceThreshold (0-100 scale), learnedPatterns JSONB
- Signal types: response.accepted/ignored/rejected, command.repeated, suggestion.acted_on/dismissed, error.occurred, session.long/short
- Adaptive behavior engine adjusts all 4 profile axes via weighted signal accumulation
- API: `POST /api/feedback/signal`, `GET /api/feedback/profile`, `GET /api/feedback/signals`, `POST /api/feedback/profile/reset`
- Frontend: live gauge bars, signal injection panel, signal history feed
- Route: `/feedback` | Nav label: FEEDBACK

### Prediction Engine + Autonomy Controller (Level 6 + 7, `/api/predictions`, `/api/autonomy`)
- `predictions` table: prediction text, confidence %, suggestedAction, triggerWindow, basis JSON, status (pending/executed/rejected/expired)
- `autonomy_config` table: enabled, safetyLevel (strict/moderate/permissive), confirmationRequired, allowedActions[], blockedActions[]
- `autonomy_log` table: action, actionType (allowed/blocked/requires_confirmation), parameters, outcome, reason
- Prediction generation analyzes active goals and feedback signals to emit actionable predictions
- Safety enforcement: strict blocks all restricted actions; moderate requires confirmation; permissive allows all whitelisted
- API: `POST /api/predictions/generate`, `GET /api/predictions`, `PATCH /api/predictions/:id`, `GET /api/autonomy/config`, `PUT /api/autonomy/config`, `POST /api/autonomy/execute`, `GET /api/autonomy/log`
- Frontend: prediction list with accept/reject actions, autonomy controller config panel, test executor, execution log
- Route: `/autonomous` | Nav label: AUTONOMOUS

### Memory System
- Short-term: session memory with 1h TTL by default (PostgreSQL), auto-expired on timer
- Long-term: persistent memory with keyword search (PostgreSQL)
- New endpoints: `GET /api/memory/search?q=`, `GET /api/memory/recent`, `POST /api/memory`, `DELETE /api/memory/:id`

### Device Abstraction Layer
- 6 simulated devices: temperature sensor, humidity sensor, relay array, OLED display, network probe, Pi GPIO
- Device types: sensor, actuator, display, network, simulated
- Protocols: simulated (MQTT/WebSocket abstraction ready)

### Command Router
- Rule-based command dispatch with AI-assist opt-in
- Full command history stored in PostgreSQL
- Commands: status, ping, help, plugins, devices, ls, memory search, infer

## Database Schema

- `memory_entries` — short and long-term memory storage
- `command_history` — full command execution history
- `system_events` — event bus traffic log (`level`, `message`=event type, `source`, `data`=full event JSON)
- `user_cognitive_model` — UCM singleton (id=1); JSONB columns for 7 layers
- `ucm_settings` — UCM control knobs singleton (id=1)
- `goals` — goal entries with priority, status, completion %, parentGoalId for hierarchy
- `goal_plans` — auto-generated step plans with confidence scoring
- `feedback_signals` — weighted behavioral signal log
- `behavior_profile` — adaptive behavior singleton; 4 axes adjusted by signal accumulation
- `predictions` — AI-generated predictions tied to goals/signals with confidence %
- `autonomy_config` — autonomy controller config singleton (safety level, allowed/blocked actions)
- `autonomy_log` — full log of every attempted autonomous action and its outcome

## Shared Packages
- `lib/event-bus` — shared event types, EventBus class, Plugin base class
- `lib/api-zod` — generated Zod validators from OpenAPI spec
- `lib/api-client-react` — generated React Query hooks from OpenAPI spec
- `lib/db` — Drizzle ORM client and schema
