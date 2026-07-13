import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useCallback,
  useMemo,
} from "react";

export type WsEvent = {
  id?: string;
  version?: string;
  type: string;
  source?: string;
  target?: string | null;
  payload: unknown;
  timestamp: string;
};

export type WsStatus = "connecting" | "connected" | "disconnected";

type SendPayload = {
  type: string;
  payload: unknown;
  target?: string | null;
};

type WebSocketContextValue = {
  status: WsStatus;
  events: WsEvent[];
  sendEvent: (envelope: SendPayload) => void;
};

const WebSocketContext = createContext<WebSocketContextValue>({
  status: "disconnected",
  events: [],
  sendEvent: () => {},
});

const MAX_EVENTS = 200;
const BASE_RECONNECT_MS = 1000;
const MAX_RECONNECT_MS = 30_000;

function buildWsUrl(): string {
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${window.location.host}/api/ws`;
}

export function WebSocketProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<WsStatus>("connecting");
  const [events, setEvents] = useState<WsEvent[]>([]);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const attemptRef = useRef(0);
  const unmountedRef = useRef(false);

  const pushEvents = useCallback((incoming: WsEvent[]) => {
    setEvents((prev) => {
      const combined = [...prev, ...incoming];
      return combined.length > MAX_EVENTS ? combined.slice(-MAX_EVENTS) : combined;
    });
  }, []);

  const connect = useCallback(() => {
    if (unmountedRef.current) return;

    setStatus("connecting");
    const ws = new WebSocket(buildWsUrl());
    wsRef.current = ws;

    ws.onopen = () => {
      if (unmountedRef.current) { ws.close(); return; }
      attemptRef.current = 0;
      setStatus("connected");
    };

    // Acknowledges nudge delivery back to the server so it can mark the row
    // surfaced. This only fires once the message has actually been parsed and
    // handed to the UI here — a dropped connection or an evicted send-queue
    // entry never reaches this point, so the nudge correctly stays
    // unsurfaced and gets redelivered on the next reconnect.
    const ackNudges = (nudgeIds: number[]) => {
      const ids = nudgeIds.filter((id): id is number => typeof id === "number");
      if (!ids.length || ws.readyState !== WebSocket.OPEN) return;
      ws.send(JSON.stringify({ type: "nudge.ack", payload: { nudgeIds: ids } }));
    };

    ws.onmessage = (evt) => {
      if (unmountedRef.current) return;
      try {
        const data = JSON.parse(evt.data as string) as unknown;
        if (!data || typeof data !== "object") return;
        const msg = data as Record<string, unknown>;

        if (msg["type"] === "history.replay") {
          const payload = msg["payload"] as Record<string, unknown> | undefined;
          const evts = (payload?.["events"] as WsEvent[] | undefined) ?? [];
          if (evts.length > 0) {
            pushEvents(evts);
            const nudgeIds = evts
              .filter((e) => e.type === "initiative.nudge_created")
              .map((e) => (e.payload as Record<string, unknown> | undefined)?.["nudgeId"])
              .filter((id): id is number => typeof id === "number");
            if (nudgeIds.length) ackNudges(nudgeIds);
          }
          return;
        }

        // Nudges that were written to the DB but never made it out live
        // (crash/disconnect window) are redelivered here on connect. Fan
        // them out as regular "initiative.nudge_created" events so existing
        // UI that listens for that type picks them up unchanged, then ack
        // each one so the server can mark it surfaced.
        if (msg["type"] === "nudge.backlog") {
          const payload = msg["payload"] as Record<string, unknown> | undefined;
          const nudges = (payload?.["nudges"] as Array<Record<string, unknown>> | undefined) ?? [];
          if (nudges.length > 0) {
            pushEvents(nudges.map((n) => ({
              type: "initiative.nudge_created",
              source: "initiative-engine",
              target: null,
              payload: n,
              timestamp: (n["createdAt"] as string | undefined) ?? new Date().toISOString(),
            })));
            ackNudges(nudges.map((n) => n["nudgeId"] as number));
          }
          return;
        }

        if (typeof msg["type"] === "string" && msg["timestamp"]) {
          pushEvents([{
            id: msg["id"] as string | undefined,
            version: msg["version"] as string | undefined,
            type: msg["type"] as string,
            source: msg["source"] as string | undefined,
            target: msg["target"] as string | null | undefined,
            payload: msg["payload"],
            timestamp: msg["timestamp"] as string,
          }]);

          // Live nudge push (and any nudge_created entries replayed via
          // history.replay's generic branch above) get acked here too.
          if (msg["type"] === "initiative.nudge_created") {
            const payload = msg["payload"] as Record<string, unknown> | undefined;
            const nudgeId = payload?.["nudgeId"];
            if (typeof nudgeId === "number") ackNudges([nudgeId]);
          }
        }
      } catch {
      }
    };

    ws.onerror = () => { ws.close(); };

    ws.onclose = () => {
      if (unmountedRef.current) return;
      wsRef.current = null;
      setStatus("disconnected");
      const delay = Math.min(BASE_RECONNECT_MS * 2 ** attemptRef.current, MAX_RECONNECT_MS);
      attemptRef.current += 1;
      reconnectTimerRef.current = setTimeout(connect, delay);
    };
  }, [pushEvents]);

  useEffect(() => {
    unmountedRef.current = false;
    connect();
    return () => {
      unmountedRef.current = true;
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.close();
      }
    };
  }, [connect]);

  const sendEvent = useCallback((envelope: SendPayload) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(envelope));
    }
  }, []);

  const value = useMemo(
    () => ({ status, events, sendEvent }),
    [status, events, sendEvent],
  );

  return <WebSocketContext.Provider value={value}>{children}</WebSocketContext.Provider>;
}

export function useWebSocket() {
  return useContext(WebSocketContext);
}

export function useWsEvents(filter?: (e: WsEvent) => boolean): WsEvent[] {
  const { events } = useWebSocket();
  return useMemo(
    () => (filter ? events.filter(filter) : events),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [events],
  );
}

export function useLatestEvent(type: string): WsEvent | null {
  const { events } = useWebSocket();
  return useMemo(() => {
    for (let i = events.length - 1; i >= 0; i--) {
      if (events[i]!.type === type) return events[i]!;
    }
    return null;
  }, [events, type]);
}

export function useLatestPayload<T>(type: string): T | null {
  const event = useLatestEvent(type);
  return event ? (event.payload as T) : null;
}

/**
 * Returns a 0–1 activity level based on how many WebSocket events
 * arrived in the last 3 seconds.  0 = idle, 1 = 15+ events/3 s.
 *
 * A 500 ms interval tick forces the memo to recompute even when no new
 * events arrive, so activity decays naturally after bursts end.
 */
export function useActivityLevel(): number {
  const { events } = useWebSocket();
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 500);
    return () => clearInterval(id);
  }, []);

  return useMemo(() => {
    const cutoff = Date.now() - 3000;
    const recent = events.filter(
      (e) => new Date(e.timestamp).getTime() > cutoff,
    ).length;
    return Math.min(recent / 15, 1);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [events, tick]);
}
