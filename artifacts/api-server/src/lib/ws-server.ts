import { WebSocketServer, WebSocket } from "ws";
import type { IncomingMessage } from "http";
import type { Server } from "http";
import { bus } from "./bus.js";
import { logger } from "./logger.js";
import type { BusEvent } from "@workspace/event-bus";

const clients = new Set<WebSocket>();

export function attachWebSocketServer(server: Server): WebSocketServer {
  const wss = new WebSocketServer({ server, path: "/api/ws" });

  wss.on("connection", (ws: WebSocket, req: IncomingMessage) => {
    const ip = req.socket.remoteAddress ?? "unknown";
    logger.info({ ip }, "WS client connected");
    clients.add(ws);

    ws.on("close", () => {
      clients.delete(ws);
      logger.info({ ip }, "WS client disconnected");
    });

    ws.on("error", (err) => {
      logger.error({ err, ip }, "WS client error");
      clients.delete(ws);
    });

    ws.send(JSON.stringify({
      type: "ws.connected",
      payload: { message: "DeckOS stream open", clientCount: clients.size },
      timestamp: new Date().toISOString(),
    }));
  });

  bus.subscribe("*", (event: BusEvent) => {
    broadcast(event);
  });

  logger.info("WebSocket server attached at /api/ws");
  return wss;
}

export function broadcast(data: unknown): void {
  const message = JSON.stringify(data);
  let sent = 0;
  for (const ws of clients) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(message);
      sent++;
    }
  }
  if (sent > 0) {
    logger.debug({ sent, clientCount: clients.size }, "WS broadcast");
  }
}

export function getClientCount(): number {
  return clients.size;
}
