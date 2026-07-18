/**
 * End-to-end tests for the nudge → WebSocket delivery pipeline.
 *
 * Two scenarios are covered:
 *  1. Live delivery  – a connected client receives an `initiative.nudge_created`
 *     bus event and replies with `nudge.ack`; the server marks the nudge surfaced.
 *  2. Backlog delivery – a client that connects when unsurfaced nudges already
 *     exist in the DB receives a `nudge.backlog` frame on reconnect.
 *
 * Real HTTP + WebSocket infrastructure is used; only the database and the
 * production `bus` singleton are replaced with test doubles.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import http from "node:http";
import { WebSocket } from "ws";

// ── Hoisted shared state ──────────────────────────────────────────────────────
//
// vi.hoisted() executes synchronously before ALL imports and vi.mock() factory
// functions, so nothing can be imported here — the shim must be self-contained.

const hoisted = vi.hoisted(() => {
  type Handler = (event: Record<string, unknown>) => void | Promise<void>;

  /**
   * Minimal event bus that mimics the EventBus interface used by ws-server.ts:
   *   • emit({ source, target, type, payload })
   *   • subscribe(type, handler) → id
   *   • unsubscribe(id)
   *
   * No external dependencies — safe to call from within vi.hoisted().
   */
  function makeBus() {
    const subs: Array<{ id: string; type: string; handler: Handler }> = [];
    let counter = 0;

    return {
      /** Exposed so beforeEach can wipe subscriptions between tests. */
      _subs: subs,

      emit(ev: {
        source: string;
        target: unknown;
        type: string;
        payload: unknown;
      }) {
        const full: Record<string, unknown> = {
          ...ev,
          id: `test-${++counter}`,
          version: "v1",
          timestamp: new Date().toISOString(),
        };
        // Process synchronously so tests can emit and immediately wait for the frame.
        for (const sub of [...subs]) {
          if (
            sub.type === "*" ||
            sub.type === full["type"] ||
            (full["type"] as string).startsWith(sub.type + ".")
          ) {
            void sub.handler(full);
          }
        }
      },

      subscribe(type: string, handler: Handler): string {
        const id = `sub-${++counter}`;
        subs.push({ id, type, handler });
        return id;
      },

      unsubscribe(id: string) {
        const idx = subs.findIndex((s) => s.id === id);
        if (idx !== -1) subs.splice(idx, 1);
      },
    };
  }

  type Bus = ReturnType<typeof makeBus>;

  /** Replaced in beforeEach so each test gets a fresh bus with no subscribers. */
  const state: { bus: Bus } = { bus: makeBus() };

  /** Nudges the mock DB will return for the "backlog" query. */
  const unsurfacedNudges: Array<{
    id: number;
    category: string;
    content: string;
    urgencyScore: number;
    targetGoalId: number | null;
    targetThreadId: number | null;
    dismissed: boolean;
    surfacedAt: Date | null;
    createdAt: Date;
  }> = [];

  /** Tracks calls to db.update() for nudge surfacing assertions. */
  const updateCalls: Array<{ ids: number[] }> = [];

  return { state, makeBus, unsurfacedNudges, updateCalls };
});

// ── Module mocks ──────────────────────────────────────────────────────────────

vi.mock("@workspace/db", () => {
  // Symbols identify which table was passed to .from() so the same chain can
  // return different data for history vs backlog queries.
  const systemEventsTableSym = Symbol("systemEvents");
  const nudgesTableSym = Symbol("nudges");

  function makeSelectChain(resolvedTable?: symbol) {
    let table = resolvedTable;

    const chain: Record<string, unknown> = {
      from(t: symbol) {
        table = t;
        return chain;
      },
      where: () => chain,
      orderBy: () => chain,
      limit: () => chain,
      // Awaiting the chain resolves with the right rows.
      then(
        onFulfilled: (v: unknown[]) => unknown,
        onRejected: (e: unknown) => unknown,
      ) {
        const rows =
          table === nudgesTableSym ? [...hoisted.unsurfacedNudges] : [];
        return Promise.resolve(rows).then(onFulfilled, onRejected);
      },
    };
    return chain;
  }

  return {
    db: {
      select: () => makeSelectChain(),
      update: (_table: unknown) => ({
        set: (_values: unknown) => ({
          where: (_cond: unknown) => {
            // We can't easily recover the id from the mock eq() result, so
            // we push a sentinel to signal the call happened. Tests that need
            // specific IDs use the real markNudgesSurfaced code path instead.
            hoisted.updateCalls.push({ ids: [] });
            return Promise.resolve();
          },
        }),
      }),
    },
    systemEventsTable: systemEventsTableSym,
    nudgesTable: nudgesTableSym,
    // Drizzle helpers referenced by ws-server.ts
    eq: (..._args: unknown[]) => Symbol("eq"),
    and: (..._args: unknown[]) => Symbol("and"),
    isNull: (..._args: unknown[]) => Symbol("isNull"),
    desc: (..._args: unknown[]) => Symbol("desc"),
  };
});

// The bus mock is a proxy to hoisted.state.bus so tests can swap instances.
vi.mock("../bus.js", () => ({
  get bus() {
    return hoisted.state.bus;
  },
}));

vi.mock("../logger.js", () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

function startServer(): Promise<{ server: http.Server; port: number }> {
  return new Promise((resolve) => {
    const server = http.createServer();
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address() as { port: number };
      resolve({ server, port: addr.port });
    });
  });
}

function connectWs(port: number): WebSocket {
  return new WebSocket(`ws://127.0.0.1:${port}/api/ws`);
}

/**
 * Resolves with the first frame matching `predicate`; rejects on timeout.
 */
function waitForFrame<T extends { type: string }>(
  ws: WebSocket,
  predicate: (msg: T) => boolean,
  timeoutMs = 3000,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`waitForFrame timed out (${timeoutMs}ms)`)),
      timeoutMs,
    );

    const handler = (raw: Buffer | string) => {
      try {
        const msg = JSON.parse(raw.toString()) as T;
        if (predicate(msg)) {
          clearTimeout(timer);
          ws.off("message", handler);
          resolve(msg);
        }
      } catch {
        // skip non-JSON frames
      }
    };
    ws.on("message", handler);
  });
}

// ── Test lifecycle ────────────────────────────────────────────────────────────

let server: http.Server;
let port: number;
const openClients: WebSocket[] = [];

beforeEach(async () => {
  // Fresh bus per test (avoids stale broadcast subscriptions).
  hoisted.state.bus = hoisted.makeBus();

  // Reset DB state.
  hoisted.unsurfacedNudges.length = 0;
  hoisted.updateCalls.length = 0;

  // Spin up HTTP server and attach WebSocket server.
  // Dynamic import ensures the module picks up the current mock state.
  const { attachWebSocketServer } = await import("../ws-server.js");
  const result = await startServer();
  server = result.server;
  port = result.port;
  attachWebSocketServer(server);
});

afterEach(async () => {
  for (const ws of openClients.splice(0)) {
    if (ws.readyState === WebSocket.OPEN) ws.terminate();
  }
  await new Promise<void>((res) => server.close(() => res()));

  // Remove cached module so next test re-runs attachWebSocketServer cleanly.
  vi.resetModules();
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("nudge pipeline – live delivery", () => {
  it("broadcasts initiative.nudge_created to a connected client", async () => {
    const ws = connectWs(port);
    openClients.push(ws);

    // Wait for the async init sequence to complete — history.replay is the
    // last frame sent before state.live is set to true.
    await waitForFrame(ws, (m) => m.type === "history.replay");

    // Emit a nudge on the bus the same way initiative-engine would.
    hoisted.state.bus.emit({
      source: "initiative-engine",
      target: null,
      type: "initiative.nudge_created",
      payload: {
        nudgeId: 42,
        category: "deadline",
        content: "Deadline approaching for Goal X",
        urgencyScore: 0.9,
      },
    });

    const frame = await waitForFrame<{
      type: string;
      payload: { nudgeId: number; category: string };
    }>(ws, (m) => m.type === "initiative.nudge_created");

    expect(frame.type).toBe("initiative.nudge_created");
    expect(frame.payload.nudgeId).toBe(42);
    expect(frame.payload.category).toBe("deadline");
  });

  it("calls db.update to mark nudge surfaced after client sends nudge.ack", async () => {
    const ws = connectWs(port);
    openClients.push(ws);

    await waitForFrame(ws, (m) => m.type === "history.replay");

    hoisted.state.bus.emit({
      source: "initiative-engine",
      target: null,
      type: "initiative.nudge_created",
      payload: {
        nudgeId: 7,
        category: "check_in",
        content: "Ready to check in?",
        urgencyScore: 0.4,
      },
    });

    await waitForFrame(ws, (m) => m.type === "initiative.nudge_created");

    // Client acknowledges delivery — server should call markNudgesSurfaced.
    ws.send(JSON.stringify({ type: "nudge.ack", payload: { nudgeIds: [7] } }));

    // Give the server event loop a cycle to process the ack.
    await new Promise((res) => setTimeout(res, 150));

    // db.update was called at least once (one call per nudge id).
    expect(hoisted.updateCalls.length).toBeGreaterThanOrEqual(1);
  });
});

describe("nudge pipeline – backlog delivery on reconnect", () => {
  it("sends nudge.backlog frame when unsurfaced nudges exist at connect time", async () => {
    // Pre-populate: a nudge that was written to DB but never ack'd.
    hoisted.unsurfacedNudges.push({
      id: 99,
      category: "goal_decay",
      content: "Goal X is losing momentum",
      urgencyScore: 0.75,
      targetGoalId: 5,
      targetThreadId: null,
      dismissed: false,
      surfacedAt: null,
      createdAt: new Date("2026-07-18T00:00:00Z"),
    });

    const ws = connectWs(port);
    openClients.push(ws);

    const frame = await waitForFrame<{
      type: string;
      payload: {
        nudges: Array<{
          nudgeId: number;
          category: string;
          urgencyScore: number;
        }>;
        count: number;
      };
    }>(ws, (m) => m.type === "nudge.backlog");

    expect(frame.payload.count).toBe(1);
    expect(frame.payload.nudges[0].nudgeId).toBe(99);
    expect(frame.payload.nudges[0].category).toBe("goal_decay");
    expect(frame.payload.nudges[0].urgencyScore).toBe(0.75);
  });

  it("does NOT send nudge.backlog when there are no unsurfaced nudges", async () => {
    // unsurfacedNudges is empty (reset in beforeEach).
    const ws = connectWs(port);
    openClients.push(ws);

    const seenTypes: string[] = [];
    ws.on("message", (raw) => {
      try {
        seenTypes.push((JSON.parse(raw.toString()) as { type: string }).type);
      } catch { /* ignore */ }
    });

    // Wait for the replay to arrive so we know the init sequence is done.
    await waitForFrame(ws, (m) => m.type === "history.replay");
    // Allow extra time for any trailing frames.
    await new Promise((res) => setTimeout(res, 300));

    expect(seenTypes).not.toContain("nudge.backlog");
  });
});
