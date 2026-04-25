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
- Pages: Dashboard HUD, AI Router, Plugins, Memory Bank, Devices, Command Console

### API Server (`artifacts/api-server`)
- **Port**: 8080
- **Preview Path**: `/api`
- Express 5 backend with all Deck OS routes

## Deck OS Architecture

### AI Router Layer
- Detects Ollama at localhost:11434 (auto-refresh every 30s)
- Supports: Ollama local models, llama.cpp, OpenAI-compatible APIs
- Default local models: mistral:instruct, llama3:8b, phi-3-mini
- Falls back to rule-engine when no LLM available
- Response caching (5 min TTL, up to 200 entries)
- Intelligence modes: DIRECT_EXECUTION, LIGHT_REASONING, DEEP_REASONING, HYBRID_MODE

### Plugin System
- 5 core plugins: system_monitor, file_manager, ai_chat, device_control, automation_scheduler
- Enable/disable via API, execute plugin commands, status tracking

### Memory System
- Short-term: session memory with 1h TTL by default (PostgreSQL)
- Long-term: persistent memory with keyword search (PostgreSQL)

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
- `system_events` — system event log
