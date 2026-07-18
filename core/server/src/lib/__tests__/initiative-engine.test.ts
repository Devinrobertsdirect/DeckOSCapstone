/**
 * Unit tests for InitiativeEngine.tick().
 *
 * The DB layer, bus, logger, and presence manager are all mocked so the
 * engine's decision logic is exercised in isolation:
 *  1. A goal past the decay threshold results in a nudge being created.
 *  2. `config.enabled === false` skips nudge creation entirely.
 *  3. A DB failure is logged — never thrown — so one bad tick can't crash
 *     the server.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Hoisted shared state ──────────────────────────────────────────────────────

const hoisted = vi.hoisted(() => {
  const state = {
    /** Row returned by the initiative_config query. */
    config: {} as Record<string, unknown>,
    /** Rows returned for the goals query. */
    goals: [] as Array<Record<string, unknown>>,
    /** Rows returned for nudge queries (active count / recently-nudged). */
    nudges: [] as Array<Record<string, unknown>>,
    /** Rows returned for the predictions query. */
    predictions: [] as Array<Record<string, unknown>>,
    /** Every row passed to db.insert(...).values(...) is recorded here. */
    inserted: [] as Array<{ table: symbol; values: Record<string, unknown> }>,
    /** When set, every select query rejects with this error. */
    selectError: null as Error | null,
  };
  const emitted: Array<Record<string, unknown>> = [];
  const logger = {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  };
  return { state, emitted, logger };
});

// ── Module mocks ──────────────────────────────────────────────────────────────

vi.mock("@workspace/db", () => {
  const goalsTable = Symbol("goals");
  const predictionsTable = Symbol("predictions");
  const nudgesTable = Symbol("nudges");
  const initiativeConfigTable = Symbol("initiativeConfig");

  function rowsFor(table: symbol | undefined): unknown[] {
    const s = hoisted.state;
    switch (table) {
      case initiativeConfigTable:
        return [s.config];
      case goalsTable:
        return s.goals;
      case nudgesTable:
        return s.nudges;
      case predictionsTable:
        return s.predictions;
      default:
        return [];
    }
  }

  function makeSelectChain() {
    let table: symbol | undefined;
    const chain: Record<string, unknown> = {
      from(t: symbol) {
        table = t;
        return chain;
      },
      where: () => chain,
      orderBy: () => chain,
      limit: () => chain,
      then(
        onFulfilled: (v: unknown[]) => unknown,
        onRejected?: (e: unknown) => unknown,
      ) {
        const err = hoisted.state.selectError;
        const p = err ? Promise.reject(err) : Promise.resolve(rowsFor(table));
        return p.then(onFulfilled, onRejected);
      },
    };
    return chain;
  }

  let nextId = 1;

  return {
    db: {
      select: () => makeSelectChain(),
      insert: (table: symbol) => ({
        values: (values: Record<string, unknown>) => ({
          returning: () => {
            hoisted.state.inserted.push({ table, values });
            return Promise.resolve([{ id: nextId++, createdAt: new Date(), ...values }]);
          },
        }),
      }),
    },
    goalsTable,
    predictionsTable,
    nudgesTable,
    initiativeConfigTable,
  };
});

vi.mock("drizzle-orm", () => ({
  eq: (...args: unknown[]) => ({ __eq: args }),
  and: (..._args: unknown[]) => Symbol("and"),
  or: (..._args: unknown[]) => Symbol("or"),
  isNull: (..._args: unknown[]) => Symbol("isNull"),
  desc: (..._args: unknown[]) => Symbol("desc"),
}));

vi.mock("../bus.js", () => ({
  bus: {
    emit: (ev: Record<string, unknown>) => {
      hoisted.emitted.push(ev);
    },
    subscribe: () => "sub-1",
    unsubscribe: () => {},
  },
}));

vi.mock("../logger.js", () => ({ logger: hoisted.logger }));

const emitted = hoisted.emitted;
const logger = hoisted.logger;

vi.mock("../presence-manager.js", () => ({
  presenceManager: {
    get: () =>
      Promise.resolve({ availability: "active", minutesSinceLastInteraction: 0 }),
  },
}));

// ── Import under test (after mocks) ──────────────────────────────────────────

import { initiativeEngine } from "../initiative-engine.js";
import { nudgesTable } from "@workspace/db";

// ── Fixtures ──────────────────────────────────────────────────────────────────

const baseConfig = {
  enabled: true,
  maxActiveNudges: 5,
  goalDecayThreshold: 0.7,
  checkInAfterMinutes: 120,
  initiativeLevel: 0.5,
};

/** An active, high-priority goal that has been decaying for ~10 hours. */
function decayingGoal() {
  return {
    id: 42,
    title: "Ship the orbital laser",
    priority: 90, // base score 0.9 alone exceeds the 0.7 threshold
    completionPct: 10,
    decayRatePerHour: 0.5,
    dueAt: null,
    updatedAt: new Date(Date.now() - 10 * 3_600_000),
    status: "active",
  };
}

beforeEach(() => {
  const s = hoisted.state;
  s.config = { ...baseConfig };
  s.goals = [];
  s.nudges = [];
  s.predictions = [];
  s.inserted = [];
  s.selectError = null;
  emitted.length = 0;
  vi.clearAllMocks();
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("InitiativeEngine.tick", () => {
  it("creates a nudge when a goal exceeds the decay threshold", async () => {
    hoisted.state.goals = [decayingGoal()];

    await initiativeEngine.tick();

    const nudgeInserts = hoisted.state.inserted.filter(
      (i) => i.table === (nudgesTable as unknown as symbol),
    );
    expect(nudgeInserts).toHaveLength(1);
    const values = nudgeInserts[0].values;
    expect(values.category).toBe("goal_decay");
    expect(values.targetGoalId).toBe(42);
    expect(values.dismissed).toBe(false);
    expect(values.urgencyScore as number).toBeGreaterThanOrEqual(0.7);
    expect(String(values.content)).toContain("Ship the orbital laser");

    // The best-effort live push went out on the bus.
    const nudgeEvents = emitted.filter(
      (e) => e.type === "initiative.nudge_created",
    );
    expect(nudgeEvents).toHaveLength(1);
    expect(
      (nudgeEvents[0].payload as { nudgeId: number }).nudgeId,
    ).toBeTypeOf("number");
  });

  it("skips nudge creation when config.enabled is false", async () => {
    hoisted.state.config = { ...baseConfig, enabled: false };
    hoisted.state.goals = [decayingGoal()];

    await initiativeEngine.tick();

    expect(hoisted.state.inserted).toHaveLength(0);
    expect(emitted).toHaveLength(0);
    expect(logger.error).not.toHaveBeenCalled();
  });

  it("logs (not throws) when the DB call fails", async () => {
    hoisted.state.selectError = new Error("connection refused");
    hoisted.state.goals = [decayingGoal()];

    await expect(initiativeEngine.tick()).resolves.toBeUndefined();

    expect(logger.error).toHaveBeenCalledTimes(1);
    const [ctx, msg] = logger.error.mock.calls[0];
    expect(msg).toBe("InitiativeEngine tick error");
    expect((ctx as { err: Error }).err.message).toBe("connection refused");
    // No nudge was created and nothing was emitted.
    expect(hoisted.state.inserted).toHaveLength(0);
    expect(emitted).toHaveLength(0);
  });
});
