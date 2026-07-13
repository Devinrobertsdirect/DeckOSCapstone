import { WebSocketServer, WebSocket } from "ws";
import type { IncomingMessage } from "http";
import type { Server } from "http";
import { bus } from "./bus.js";
import { logger } from "./logger.js";
import type { BusEvent } from "@workspace/event-bus";
import { BusEventSchema } from "@workspace/event-bus";
import { db, systemEventsTable, nudgesTable } from "@workspace/db";
import { desc, eq, and, isNull } from "drizzle-orm";
import { z } from "zod";

const MAX_QUEUE_SIZE = 500;
const SLOW_CLIENT_CLOSE_THRESHOLD = 1000;

type ClientState = {
  ws: WebSocket;
  queue: string[];
  flushing: boolean;
  live: boolean;
  preliveBuf: string[];
};

const clientStates = new Map<WebSocket, ClientState>();

const IncomingCommandSchema = z.object({
  type: z.string().min(1),
  payload: z.unknown(),
  target: z.string().nullable().optional(),
});

const NudgeAckPayloadSchema = z.object({
  nudgeIds: z.array(z.number().int()).min(1),
});

// Reconciliation: nudges are written to the DB before the "initiative.nudge_created"
// bus event is emitted for live delivery. If the process crashes or no client is
// connected in that window, the emit never lands and the nudge would otherwise sit
// undelivered until a client happens to fetch history. surfacedAt tracks whether a
// nudge has actually reached a client (live or backlog); querying for undismissed +
// unsurfaced rows on every new connection guarantees eventual delivery.
async function getUnsurfacedNudges(): Promise<Array<typeof nudgesTable.$inferSelect>> {
  try {
    return await db
      .select()
      .from(nudgesTable)
      .where(and(eq(nudgesTable.dismissed, false), isNull(nudgesTable.surfacedAt)))
      .orderBy(desc(nudgesTable.createdAt));
  } catch (err) {
    logger.error({ err }, "ws-server: failed to load unsurfaced nudges");
    return [];
  }
}

async function markNudgesSurfaced(nudgeIds: number[]): Promise<void> {
  if (!nudgeIds.length) return;
  try {
    for (const id of nudgeIds) {
      await db.update(nudgesTable).set({ surfacedAt: new Date() }).where(eq(nudgesTable.id, id));
    }
  } catch (err) {
    logger.error({ err, nudgeIds }, "ws-server: failed to mark nudges surfaced");
  }
}

async function getHistoryEvents(limit = 50): Promise<unknown[]> {
  try {
    const rows = await db
      .select()
      .from(systemEventsTable)
      .orderBy(desc(systemEventsTable.createdAt))
      .limit(limit);

    return rows
      .reverse()
      .map((row) => {
        const data = (row.data ?? {}) as Record<string, unknown>;
        return {
          id: data["eventId"] ?? String(row.id),
          version: data["version"] ?? "v1",
          type: row.message,
          source: row.source,
          target: data["target"] ?? null,
          payload: data["payload"] ?? null,
          timestamp: data["timestamp"] ?? row.createdAt.toISOString(),
        };
      });
  } catch (err) {
    logger.error({ err }, "ws-server: failed to load history events");
    return [];
  }
}

function enqueue(state: ClientState, json: string): void {
  if (state.ws.readyState !== WebSocket.OPEN) return;

  if (state.queue.length >= SLOW_CLIENT_CLOSE_THRESHOLD) {
    logger.warn("ws-server: slow client queue overflow, closing connection");
    state.ws.terminate();
    return;
  }

  if (state.queue.length >= MAX_QUEUE_SIZE) {
    state.queue.shift();
  }

  state.queue.push(json);
  scheduleFlush(state);
}

function scheduleFlush(state: ClientState): void {
  if (state.flushing) return;
  state.flushing = true;
  setImmediate(() => flushClientQueue(state));
}

function flushClientQueue(state: ClientState): void {
  state.flushing = false;
  if (state.ws.readyState !== WebSocket.OPEN) {
    state.queue.length = 0;
    return;
  }

  const batch = state.queue.splice(0, 50);
  for (const msg of batch) {
    state.ws.send(msg);
  }

  if (state.queue.length > 0) {
    scheduleFlush(state);
  }
}

function sendDirect(ws: WebSocket, data: unknown): void {
  const state = clientStates.get(ws);
  const json = JSON.stringify(data);
  if (state) {
    enqueue(state, json);
  } else if (ws.readyState === WebSocket.OPEN) {
    ws.send(json);
  }
}

export function attachWebSocketServer(server: Server): WebSocketServer {
  const wss = new WebSocketServer({ server, path: "/api/ws" });

  wss.on("connection", (ws: WebSocket, req: IncomingMessage) => {
    const ip = req.socket.remoteAddress ?? "unknown";
    logger.info({ ip }, "WS client connected");

    const state: ClientState = {
      ws,
      queue: [],
      flushing: false,
      live: false,
      preliveBuf: [],
    };
    clientStates.set(ws, state);

    bus.emit({
      source: "ws-server",
      target: null,
      type: "client.connected",
      payload: { ip, clientCount: clientStates.size },
    });

    sendDirect(ws, {
      type: "ws.connected",
      payload: { message: "DeckOS stream open", clientCount: clientStates.size },
      timestamp: new Date().toISOString(),
    });

    void (async () => {
      const events = await getHistoryEvents(50);
      sendDirect(ws, {
        type: "history.replay",
        payload: { events, count: events.length },
        timestamp: new Date().toISOString(),
      });

      // Reconciliation pass: deliver any nudge that was written to the DB but
      // never successfully surfaced to a client (crash/disconnect window),
      // regardless of whether it's still sitting in systemEventsTable history.
      const backlog = await getUnsurfacedNudges();
      if (backlog.length) {
        sendDirect(ws, {
          type: "nudge.backlog",
          payload: {
            nudges: backlog.map((n) => ({
              nudgeId: n.id,
              category: n.category,
              content: n.content,
              urgencyScore: n.urgencyScore,
              targetGoalId: n.targetGoalId,
              targetThreadId: n.targetThreadId,
              createdAt: n.createdAt.toISOString(),
            })),
            count: backlog.length,
          },
          timestamp: new Date().toISOString(),
        });
        // Not marked surfaced here — we wait for the client's "nudge.ack" so a
        // send that never actually reaches the client (dropped connection,
        // queue eviction) leaves the nudge eligible for the next reconnect.
      }

      for (const json of state.preliveBuf) {
        enqueue(state, json);
      }
      state.preliveBuf = [];
      state.live = true;
    })();

    ws.on("message", (raw) => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw.toString());
      } catch {
        sendDirect(ws, {
          type: "ws.error",
          payload: { error: "Invalid JSON", raw: raw.toString().slice(0, 200) },
          timestamp: new Date().toISOString(),
        });
        return;
      }

      const result = IncomingCommandSchema.safeParse(parsed);
      if (!result.success) {
        sendDirect(ws, {
          type: "ws.error",
          payload: {
            error: "Malformed command: must have 'type' (string) and 'payload' fields",
            issues: result.error.issues,
          },
          timestamp: new Date().toISOString(),
        });
        return;
      }

      const { type, payload, target } = result.data;

      // Client acknowledgment of nudge delivery. Handled outside the bus
      // entirely — it's not a domain event, just the confirmation that closes
      // the delivery loop and lets us safely mark nudges surfaced.
      if (type === "nudge.ack") {
        const ackResult = NudgeAckPayloadSchema.safeParse(payload);
        if (!ackResult.success) {
          sendDirect(ws, {
            type: "ws.error",
            payload: { error: "Malformed nudge.ack: expected { nudgeIds: number[] }", issues: ackResult.error.issues },
            timestamp: new Date().toISOString(),
          });
          return;
        }
        void markNudgesSurfaced(ackResult.data.nudgeIds);
        return;
      }

      const preCheck = BusEventSchema.safeParse({
        id: "00000000-0000-0000-0000-000000000000",
        version: "v1",
        source: "ws-client",
        target: target ?? null,
        type,
        payload,
        timestamp: new Date().toISOString(),
      });

      if (!preCheck.success) {
        sendDirect(ws, {
          type: "ws.error",
          payload: {
            error: `Unsupported event type: "${type}"`,
            issues: preCheck.error.issues,
          },
          timestamp: new Date().toISOString(),
        });
        return;
      }

      bus.emit({
        source: "ws-client",
        target: target ?? null,
        type: type as Parameters<typeof bus.emit>[0]["type"],
        payload,
      });
    });

    ws.on("close", () => {
      clientStates.delete(ws);
      logger.info({ ip }, "WS client disconnected");

      bus.emit({
        source: "ws-server",
        target: null,
        type: "client.disconnected",
        payload: { ip, clientCount: clientStates.size },
      });
    });

    ws.on("error", (err) => {
      logger.error({ err, ip }, "WS client error");
      clientStates.delete(ws);
    });
  });

  bus.subscribe("*", (event: BusEvent) => {
    broadcast(event);
  });

  logger.info("WebSocket server attached at /api/ws");
  return wss;
}

export function broadcast(data: unknown): void {
  const json = JSON.stringify(data);
  let sentLive = 0;
  let bufferedPrelive = 0;
  for (const [ws, state] of clientStates) {
    if (ws.readyState !== WebSocket.OPEN) continue;
    if (state.live) {
      enqueue(state, json);
      sentLive++;
    } else {
      if (state.preliveBuf.length < MAX_QUEUE_SIZE) {
        state.preliveBuf.push(json);
        bufferedPrelive++;
      }
    }
  }
  if (sentLive > 0 || bufferedPrelive > 0) {
    logger.debug({ sentLive, bufferedPrelive, clientCount: clientStates.size }, "WS broadcast");
  }

  // Deliberately does NOT mark nudges surfaced here. Being handed to `enqueue`
  // only means the message entered a client's outgoing queue — under
  // backpressure that queue evicts its oldest entries (see enqueue's
  // MAX_QUEUE_SIZE handling) before they ever reach the socket. Treating
  // "queued" as "delivered" would let a nudge be silently dropped and never
  // reconciled. surfacedAt is only set once the client explicitly
  // acknowledges receipt — see handleNudgeAck / the "nudge.ack" message type.
}

export function getClientCount(): number {
  return clientStates.size;
}
