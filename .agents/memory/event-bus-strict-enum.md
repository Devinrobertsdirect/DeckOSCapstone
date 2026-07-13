---
name: Event bus strict-enum validation
description: Why bus.emit() ZodErrors happen in api-server and where to fix them
---

`bus.emit()` (from `@workspace/event-bus`, used in `artifacts/api-server`) validates every event against `BusEventSchema`, whose `type` field is a strict `z.union` of per-category `z.enum(...)` lists defined in `lib/event-bus/src/types.ts`. Any emitted `type` string not present in one of those enums is silently rejected (logged as an error, event dropped) — this is a common source of repeated log spam plus "the event never reaches clients" bugs, since callers (e.g. `initiative-engine.ts`) don't check `emit`'s return value.

**Why:** the event bus doesn't warn at compile time when a new event type is introduced at a call site — TypeScript only catches it if the call site itself imports and narrows to `EventType`, which most call sites don't.

**How to apply:** when adding a new `bus.emit({ type: "..." })` or plugin `context.emit(...)` (which routes through the same `bus.emit`) call anywhere in `artifacts/api-server`, add the new type string to the matching enum in `lib/event-bus/src/types.ts` (or a new enum unioned into `EventTypeSchema`) in the same change. Note `broadcast()` in `ws-server.ts` is a separate raw-JSON send path that bypasses this schema entirely — types sent only via `broadcast` don't need enum entries.
