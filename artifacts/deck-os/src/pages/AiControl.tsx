import { useEffect, useRef, useState } from "react";
import { Brain, Zap, Database, Globe, CheckCircle2, XCircle, ChevronRight, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useWebSocket, useLatestPayload, useWsEvents } from "@/contexts/WebSocketContext";
import { AIFace, useFaceStyle } from "@/components/AIFace";

const MODES = ["DIRECT_EXECUTION", "LIGHT_REASONING", "DEEP_REASONING", "HYBRID_MODE"] as const;
type Mode = typeof MODES[number];

const MODE_COLORS: Record<Mode, string> = {
  DIRECT_EXECUTION: "text-[#22ff44]",
  LIGHT_REASONING: "text-[#00d4ff]",
  DEEP_REASONING: "text-[#ffaa00]",
  HYBRID_MODE: "text-[#cc44ff]",
};

const MODE_ICONS: Record<Mode, React.ElementType> = {
  DIRECT_EXECUTION: Zap,
  LIGHT_REASONING: Brain,
  DEEP_REASONING: Database,
  HYBRID_MODE: Globe,
};

type RouterStatusPayload = {
  mode?: string;
  ollamaAvailable?: boolean;
  cloudAvailable?: boolean;
  totalRequests?: number;
  cacheHitRate?: number;
  lastDetectedAt?: string;
  timestamp?: string;
  models?: { cortex?: string; reflex?: string; autopilot?: string };
  tierStats?: { cortexRequests?: number; reflexRequests?: number; autopilotRequests?: number };
};

type ChatResponsePayload = {
  model?: string;
  modelUsed?: string;
  mode?: string;
  latencyMs?: number;
  fromCache?: boolean;
  response?: string;
  requestId?: string;
};

type TierStatus = {
  cortex:    string;
  reflex:    string;
  autopilot: string;
  tierStats: { cortexRequests: number; reflexRequests: number; autopilotRequests: number };
  ollamaAvailable: boolean;
};

export default function AiControl() {
  const { sendEvent } = useWebSocket();
  const [prompt, setPrompt] = useState("");
  const [currentMode, setCurrentMode] = useState<Mode>("DIRECT_EXECUTION");
  const [sending, setSending] = useState(false);
  const [pendingRequestId, setPendingRequestId] = useState<string | null>(null);
  const [streamingText, setStreamingText] = useState("");
  const [tierStatus, setTierStatus] = useState<TierStatus | null>(null);
  const processedTokenKeysRef = useRef(new Set<string>());
  const faceStyle = useFaceStyle();

  useEffect(() => {
    const fetchTiers = () => {
      fetch(`${import.meta.env.BASE_URL}api/ai-router/status`)
        .then(r => r.json())
        .then((data: RouterStatusPayload & { models?: { cortex?: string; reflex?: string; autopilot?: string }; tierStats?: { cortexRequests?: number; reflexRequests?: number; autopilotRequests?: number } }) => {
          if (data.models) {
            setTierStatus({
              cortex:    data.models.cortex    ?? "gemma3:9b",
              reflex:    data.models.reflex    ?? "phi3",
              autopilot: data.models.autopilot ?? "rule-engine-v1",
              tierStats: {
                cortexRequests:    data.tierStats?.cortexRequests    ?? 0,
                reflexRequests:    data.tierStats?.reflexRequests    ?? 0,
                autopilotRequests: data.tierStats?.autopilotRequests ?? 0,
              },
              ollamaAvailable: data.ollamaAvailable ?? false,
            });
          }
        })
        .catch(() => {});
    };
    fetchTiers();
    const id = setInterval(fetchTiers, 10_000);
    return () => clearInterval(id);
  }, []);

  const routerStatus = useLatestPayload<RouterStatusPayload>("ai.router.status");
  const latestChatResponse = useLatestPayload<ChatResponsePayload>("ai.chat.response");
  const aiEvents = useWsEvents((e) =>
    e.type === "ai.router.status" ||
    e.type === "ai.inference_started" ||
    e.type === "ai.inference_completed" ||
    e.type === "ai.chat.request" ||
    e.type === "ai.chat.response"
  );

  const chatResponses = useWsEvents((e) => e.type === "ai.chat.response");
  const chatTokens = useWsEvents((e) => e.type === "ai.chat.token");

  useEffect(() => {
    const mode = routerStatus?.mode as Mode | undefined;
    if (mode && MODES.includes(mode)) setCurrentMode(mode);
  }, [routerStatus]);

  useEffect(() => {
    if (!pendingRequestId) return;
    chatTokens.forEach((evt) => {
      const p = evt.payload as { requestId?: string; token?: string };
      if (p.requestId !== pendingRequestId) return;
      const evtKey = `token:${evt.timestamp}:${evt.id ?? ""}`;
      if (processedTokenKeysRef.current.has(evtKey)) return;
      processedTokenKeysRef.current.add(evtKey);
      setStreamingText((prev) => prev + (p.token ?? ""));
    });
  }, [chatTokens, pendingRequestId]);

  useEffect(() => {
    if (!pendingRequestId) return;
    const matched = chatResponses.some((e) => {
      const p = e.payload as ChatResponsePayload;
      return p.requestId === pendingRequestId;
    });
    if (matched) {
      setSending(false);
      setPendingRequestId(null);
      setStreamingText("");
    }
  }, [chatResponses, pendingRequestId]);

  const handleSetMode = (m: Mode) => {
    setCurrentMode(m);
    sendEvent({ type: "ai.mode.set", payload: { mode: m } });
  };

  const handleInfer = (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim() || sending) return;
    const requestId = `req-${Date.now()}`;
    setSending(true);
    setPendingRequestId(requestId);
    setStreamingText("");
    processedTokenKeysRef.current.clear();
    sendEvent({
      type: "ai.chat.request",
      payload: { prompt: prompt.trim(), mode: currentMode, requestId },
    });
    setPrompt("");
  };

  const ollamaOk = routerStatus?.ollamaAvailable ?? false;
  const cloudOk = routerStatus?.cloudAvailable ?? false;

  const outputItems = chatResponses.slice(-20).reverse();

  return (
    <div className="flex flex-col gap-6 h-full">
      <div className="flex items-center gap-2 font-mono text-xs text-primary/60 uppercase tracking-widest">
        <Brain className="w-4 h-4 text-primary" />
        <span>AI.ROUTER // INTELLIGENCE CONTROL LAYER</span>
      </div>

      {sending && (
        <div className="flex items-center gap-4 px-4 py-2 border border-primary/20 bg-primary/[0.03]">
          <AIFace
            style={faceStyle}
            speaking={true}
            size={faceStyle === "iris" ? 48 : 72}
            color="var(--color-primary)"
          />
          <div className="font-mono text-xs flex flex-col gap-0.5">
            <span className="text-primary uppercase tracking-widest">
              {streamingText ? "STREAMING RESPONSE" : "PROCESSING REQUEST"}
            </span>
            <span className="text-primary/40">// JARVIS ACTIVE</span>
          </div>
          <Loader2 className="w-3 h-3 text-primary/30 animate-spin ml-auto" />
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatusTile label="OLLAMA.LOCAL" value={ollamaOk ? "CONNECTED" : "OFFLINE"} ok={ollamaOk} />
        <StatusTile label="CLOUD.API" value={cloudOk ? "AVAILABLE" : "UNAVAILABLE"} ok={cloudOk} />
        <StatusTile label="AI.EVENTS" value={`${aiEvents.length} EVENTS`} ok={aiEvents.length > 0} />
      </div>

      {/* ── 3-Tier Model Routing Gateway ─────────────────────────────────── */}
      <div className="border border-primary/20 bg-card/40 p-5 font-mono">
        <div className="text-primary/50 text-[10px] uppercase tracking-widest mb-4">MODEL.ROUTING.GATEWAY</div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {[
            {
              tier:    "CORTEX",
              model:   tierStatus?.cortex ?? "gemma3:9b",
              role:    "Thinking Layer",
              desc:    "chat · reasoning · planning · briefings · predictions",
              color:   "#3f84f3",
              reqs:    tierStatus?.tierStats.cortexRequests ?? 0,
              active:  tierStatus?.ollamaAvailable ?? false,
            },
            {
              tier:    "REFLEX",
              model:   tierStatus?.reflex ?? "phi3",
              role:    "Fast Layer",
              desc:    "classification · routing · commands · quick responses",
              color:   "#ffc820",
              reqs:    tierStatus?.tierStats.reflexRequests ?? 0,
              active:  tierStatus?.ollamaAvailable ?? false,
            },
            {
              tier:    "AUTOPILOT",
              model:   "rule-engine-v1",
              role:    "Deterministic Layer",
              desc:    "system · devices · safety · fallback",
              color:   "#11d97a",
              reqs:    tierStatus?.tierStats.autopilotRequests ?? 0,
              active:  true,
            },
          ].map(({ tier, model, role, desc, color, reqs, active }) => (
            <div key={tier} className="border border-primary/10 bg-card/20 p-3 space-y-2">
              <div className="flex items-center justify-between">
                <div className="text-[10px] font-bold" style={{ color }}>{tier}</div>
                <div className={`w-1.5 h-1.5 rounded-full ${active ? "bg-emerald-400" : "bg-red-500/50"}`} />
              </div>
              <div className="text-[11px] text-primary/70 font-bold truncate">{model}</div>
              <div className="text-[9px] text-primary/40 uppercase tracking-wider">{role}</div>
              <div className="text-[9px] text-primary/25 leading-snug">{desc}</div>
              <div className="pt-1 border-t border-primary/10 flex justify-between text-[9px]">
                <span className="text-primary/30">REQUESTS</span>
                <span style={{ color }}>{reqs}</span>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-3 text-primary/20 text-[9px]">
          Task routing: chat/reasoning → CORTEX (Gemma) · classification/commands → REFLEX (phi3) · system/devices → AUTOPILOT (rule engine)
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="bg-card/40 border-primary/20 rounded-none">
          <CardHeader className="border-b border-primary/20 p-4">
            <CardTitle className="font-mono text-sm text-primary">INTELLIGENCE.MODE</CardTitle>
          </CardHeader>
          <CardContent className="p-4 space-y-2">
            {MODES.map((m) => {
              const Icon = MODE_ICONS[m];
              const active = currentMode === m;
              return (
                <button
                  key={m}
                  data-testid={`mode-btn-${m}`}
                  onClick={() => handleSetMode(m)}
                  className={`w-full flex items-center gap-3 p-3 border font-mono text-sm transition-all
                    ${active
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-primary/20 hover:border-primary/50 text-primary/60 hover:text-primary/80"
                    }`}
                >
                  <Icon className={`w-4 h-4 ${active ? MODE_COLORS[m] : "text-primary/40"}`} />
                  <span className={active ? MODE_COLORS[m] : ""}>{m}</span>
                  {active && <ChevronRight className="ml-auto w-4 h-4 text-primary" />}
                </button>
              );
            })}
          </CardContent>
        </Card>

        <Card className="bg-card/40 border-primary/20 rounded-none">
          <CardHeader className="border-b border-primary/20 p-4">
            <CardTitle className="font-mono text-sm text-primary">LIVE.AI.STATUS</CardTitle>
          </CardHeader>
          <CardContent className="p-4 space-y-2 font-mono text-xs">
            <div className="flex justify-between">
              <span className="text-muted-foreground">CURRENT.MODE</span>
              <span className="text-primary">{routerStatus?.mode ?? currentMode}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">TOTAL.REQUESTS</span>
              <span className="text-primary">{routerStatus?.totalRequests ?? 0}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">CACHE.HIT.RATE</span>
              <span className="text-[#aa88ff]">{((routerStatus?.cacheHitRate ?? 0) * 100).toFixed(0)}%</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">LAST.MODEL</span>
              <span className="text-[#00d4ff] truncate max-w-[120px]">{latestChatResponse?.modelUsed ?? latestChatResponse?.model ?? "---"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">LAST.LATENCY</span>
              <span className="text-primary">{latestChatResponse?.latencyMs ?? "---"}ms</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">LAST.DETECTED</span>
              <span className="text-primary/50 text-xs truncate">
                {routerStatus?.lastDetectedAt
                  ? new Date(routerStatus.lastDetectedAt).toLocaleTimeString()
                  : "---"}
              </span>
            </div>
            <div className="pt-2 border-t border-primary/10 space-y-1">
              <div className="text-primary/40 mb-1">EVENT.STREAM</div>
              {aiEvents.slice(-5).reverse().map((e, i) => (
                <div key={i} className="flex justify-between text-primary/50">
                  <span>{e.type}</span>
                  <span>{new Date(e.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</span>
                </div>
              ))}
              {aiEvents.length === 0 && <div className="text-primary/20">No AI events yet</div>}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="flex-1 bg-card/40 border-primary/20 rounded-none flex flex-col min-h-0">
        <CardHeader className="border-b border-primary/20 p-4">
          <CardTitle className="font-mono text-sm text-primary">AI.CHAT.CONSOLE</CardTitle>
        </CardHeader>
        <div className="flex-1 overflow-y-auto p-4 space-y-3 font-mono text-xs min-h-0">
          {outputItems.length === 0 && !sending && (
            <div className="text-primary/40">// Send a prompt to get an AI response via WebSocket event stream</div>
          )}
          {outputItems.map((item, i) => {
            const p = item.payload as ChatResponsePayload;
            return (
              <div key={i} className="border border-primary/10 p-3 bg-background/50 space-y-1">
                <div className="flex justify-between text-primary/40">
                  <span>MODEL: {p.modelUsed ?? p.model ?? "---"}</span>
                  <span>{p.fromCache && <span className="text-[#ffaa00] mr-2">CACHED</span>}{p.latencyMs}ms</span>
                </div>
                <div className="text-primary/90 whitespace-pre-wrap">{p.response ?? "---"}</div>
              </div>
            );
          })}
          {sending && (
            <div className="border border-primary/20 p-3 bg-background/50 space-y-1">
              <div className="flex items-center gap-2 text-primary/40 mb-1">
                <Loader2 className="w-3 h-3 animate-spin" />
                <span>STREAMING...</span>
              </div>
              <div className="text-primary/90 whitespace-pre-wrap">
                {streamingText || <span className="text-primary/30">Waiting for tokens...</span>}
                {streamingText && (
                  <span className="inline-block w-[2px] h-[1em] bg-primary align-middle ml-[1px] animate-[blink_1s_step-end_infinite]" />
                )}
              </div>
            </div>
          )}
        </div>
        <form onSubmit={handleInfer} className="border-t border-primary/20 p-4 flex gap-2">
          <span className="text-primary font-mono mt-2 text-sm">&gt;</span>
          <Input
            data-testid="infer-input"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            className="font-mono border-none bg-transparent focus-visible:ring-0 text-primary px-0"
            placeholder="Enter prompt for AI router..."
          />
          <button
            type="submit"
            data-testid="infer-submit"
            disabled={sending}
            className="border border-primary/40 px-4 font-mono text-xs text-primary hover:bg-primary/10 transition-all disabled:opacity-50"
          >
            {sending ? <Loader2 className="w-3 h-3 animate-spin" /> : "SEND"}
          </button>
        </form>
      </Card>
    </div>
  );
}

function StatusTile({ label, value, ok }: { label: string; value: string; ok: boolean }) {
  return (
    <div className="border border-primary/20 bg-card/40 p-4 font-mono">
      <div className="text-xs text-muted-foreground mb-1">{label}</div>
      <div className={`text-sm font-bold flex items-center gap-2 ${ok ? "text-[#22ff44]" : "text-[#ff3333]"}`}>
        {ok ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
        {value}
      </div>
    </div>
  );
}
