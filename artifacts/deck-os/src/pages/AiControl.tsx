import { useEffect, useRef, useState } from "react";
import { Brain, Zap, Database, Globe, CheckCircle2, XCircle, ChevronRight, Loader2, Copy, Check, Terminal, Package } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useWebSocket, useLatestPayload, useWsEvents } from "@/contexts/WebSocketContext";
import { AIFace, useFaceStyle } from "@/components/AIFace";
import { useAiName } from "@/hooks/useAiName";
import { useUserName } from "@/hooks/useUserName";

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
  openclawAvailable?: boolean;
  totalRequests?: number;
  cacheHitRate?: number;
  lastDetectedAt?: string;
  timestamp?: string;
  models?: { cortex?: string; reflex?: string; autopilot?: string };
  tierStats?: { cortexRequests?: number; reflexRequests?: number; autopilotRequests?: number };
};

type OpenClawStatus = {
  running: boolean;
  gateway: string;
  model: string;
  port: number;
};

type ClawSkill = {
  slug: string;
  name: string;
  author: string;
  category: string;
  description: string;
  installCount: number;
  tags: string[];
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
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
  const [tierStatus, setTierStatus] = useState<TierStatus | null>(null);
  const [openclawStatus, setOpenclawStatus] = useState<OpenClawStatus | null>(null);
  const [clawSkills, setClawSkills] = useState<ClawSkill[]>([]);
  const [clawInstalling, setClawInstalling] = useState<string | null>(null);
  const [clawInstallMsg, setClawInstallMsg] = useState<string | null>(null);
  const processedTokenKeysRef = useRef(new Set<string>());
  const faceStyle = useFaceStyle();
  const aiName = useAiName();
  const userName = useUserName();

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

  useEffect(() => {
    const fetchClaw = () => {
      fetch(`${import.meta.env.BASE_URL}api/openclaw/status`)
        .then(r => r.json())
        .then((d: OpenClawStatus) => setOpenclawStatus(d))
        .catch(() => {});
    };
    fetchClaw();
    const id = setInterval(fetchClaw, 15_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}api/openclaw/skills?limit=12`)
      .then(r => r.json())
      .then((d: { skills?: ClawSkill[] }) => setClawSkills(d.skills ?? []))
      .catch(() => {});
  }, []);

  const handleClawInstall = async (slug: string) => {
    setClawInstalling(slug);
    setClawInstallMsg(null);
    try {
      const r = await fetch(`${import.meta.env.BASE_URL}api/openclaw/skills/install`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug }),
      });
      const d = await r.json() as { installCommand?: string };
      setClawInstallMsg(`Run in WSL: ${d.installCommand ?? `clawhub install ${slug}`}`);
    } catch {
      setClawInstallMsg("Failed to get install command.");
    } finally {
      setClawInstalling(null);
      setTimeout(() => setClawInstallMsg(null), 8_000);
    }
  };

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
  const clawOk = openclawStatus?.running ?? (routerStatus?.openclawAvailable ?? false);

  const outputItems = chatResponses.slice(-20).reverse();

  return (
    <div className="flex flex-col gap-6 h-full">
      <div className="flex items-center gap-2 font-mono text-xs text-primary/60 uppercase tracking-widest">
        <Brain className="w-4 h-4 text-primary" />
        <span>AI.ROUTER // INTELLIGENCE CONTROL LAYER</span>
      </div>

      <div className="flex items-center gap-4 px-4 py-2 border border-primary/20 bg-primary/[0.03]">
        <AIFace
          style={faceStyle}
          speaking={!!streamingText}
          size={faceStyle === "iris" ? 48 : 72}
          color="var(--color-primary)"
        />
        <div className="font-mono text-xs flex flex-col gap-0.5">
          <span className="text-primary uppercase tracking-widest">
            {streamingText ? "STREAMING RESPONSE" : sending ? "PROCESSING REQUEST" : "WAITING FOR INPUT"}
          </span>
          <span className="text-primary/40">// {aiName} STANDING BY</span>
        </div>
        {sending && <Loader2 className="w-3 h-3 text-primary/30 animate-spin ml-auto" />}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatusTile label="OLLAMA.LOCAL" value={ollamaOk ? "CONNECTED" : "OFFLINE"} ok={ollamaOk} />
        <StatusTile label="OPENCLAW.GATEWAY" value={clawOk ? "RUNNING :18789" : "OFFLINE"} ok={clawOk} />
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

      {/* ── OpenClaw Integration Panel ───────────────────────────────────── */}
      <div className="border border-primary/20 bg-card/40 p-5 font-mono">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2 text-primary/50 text-[10px] uppercase tracking-widest">
            <Terminal className="w-3 h-3 text-[#cc44ff]" />
            <span>OPENCLAW.GATEWAY // LOCAL AI AGENT + 5200+ SKILLS</span>
          </div>
          <div className={`flex items-center gap-1.5 text-[10px] font-bold ${clawOk ? "text-[#22ff44]" : "text-[#ff3333]/70"}`}>
            <div className={`w-1.5 h-1.5 rounded-full ${clawOk ? "bg-[#22ff44] animate-pulse" : "bg-[#ff3333]/50"}`} />
            {clawOk ? "GATEWAY LIVE — PORT 18789" : "GATEWAY OFFLINE"}
          </div>
        </div>

        {!clawOk && (
          <div className="border border-[#ffaa00]/20 bg-[#ffaa00]/[0.03] p-3 mb-4 text-[10px]">
            <div className="text-[#ffaa00] mb-1 font-bold">START OPENCLAW</div>
            <div className="text-primary/50 space-y-0.5">
              <div>1. Open WSL terminal</div>
              <div>2. Run: <span className="text-primary/80">ollama launch openclaw</span></div>
              <div>3. Gateway starts on port 18789 — Deck OS connects automatically</div>
              <div className="pt-1 text-primary/30">Guide: docs.openclaw.ai/windows · Skills: clawhub.ai</div>
            </div>
          </div>
        )}

        {clawOk && (
          <div className="grid grid-cols-3 gap-3 mb-4 text-[10px]">
            <div className="border border-primary/10 bg-card/20 p-2">
              <div className="text-primary/30 mb-0.5">GATEWAY</div>
              <div className="text-[#22ff44]">{openclawStatus?.gateway ?? "localhost:18789"}</div>
            </div>
            <div className="border border-primary/10 bg-card/20 p-2">
              <div className="text-primary/30 mb-0.5">MODEL</div>
              <div className="text-[#cc44ff] truncate">{openclawStatus?.model ?? "gemma3:9b"}</div>
            </div>
            <div className="border border-primary/10 bg-card/20 p-2">
              <div className="text-primary/30 mb-0.5">SKILLS.REGISTRY</div>
              <div className="text-[#00d4ff]">CLAWHUB.AI</div>
            </div>
          </div>
        )}

        {clawInstallMsg && (
          <div className="border border-[#22ff44]/30 bg-[#22ff44]/[0.04] p-2 mb-3 text-[10px] text-[#22ff44] font-mono break-all">
            {clawInstallMsg}
          </div>
        )}

        <div className="mb-2 flex items-center gap-2 text-[9px] text-primary/30 uppercase">
          <Package className="w-2.5 h-2.5" />
          <span>FEATURED CLAWHUB SKILLS</span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
          {clawSkills.slice(0, 8).map((skill) => (
            <div key={skill.slug} className="border border-primary/10 bg-card/20 p-2.5 space-y-1.5">
              <div className="flex items-start justify-between gap-1">
                <div className="text-[10px] text-primary/80 font-bold leading-tight">{skill.name}</div>
                <div className="text-[8px] text-primary/30 shrink-0">{(skill.installCount / 1000).toFixed(1)}k</div>
              </div>
              <div className="text-[9px] text-primary/40 leading-snug line-clamp-2">{skill.description}</div>
              <div className="flex items-center justify-between pt-0.5">
                <span className="text-[8px] text-primary/25 uppercase">{skill.category}</span>
                <button
                  onClick={() => handleClawInstall(skill.slug)}
                  disabled={clawInstalling === skill.slug}
                  className="text-[8px] border border-primary/20 px-1.5 py-0.5 text-primary/50 hover:text-primary hover:border-primary/50 transition-all disabled:opacity-40"
                >
                  {clawInstalling === skill.slug ? <Loader2 className="w-2.5 h-2.5 animate-spin" /> : "INSTALL"}
                </button>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-3 text-[9px] text-primary/20">
          5200+ community skills · Install via clawhub CLI inside WSL · clawhub.ai · github.com/VoltAgent/awesome-openclaw-skills
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
            <div className="space-y-1">
              <div className="text-primary/70 font-mono">
                {aiName} online. All systems nominal.
              </div>
              <div className="text-primary/50 font-mono">
                Welcome back, {userName || "Commander"}. Standing by for your command.
              </div>
            </div>
          )}
          {outputItems.map((item, i) => {
            const p = item.payload as ChatResponsePayload;
            const isCopied = copiedIdx === i;
            const isEgg = (p.modelUsed ?? p.model ?? "") === "easter-egg-v1";
            return (
              <div
                key={i}
                className={`group/resp border p-3 bg-background/50 space-y-1 transition-all ${
                  isEgg
                    ? "border-[#ff3c00]/40 bg-[#ff3c00]/[0.04]"
                    : "border-primary/10"
                }`}
              >
                <div className="flex justify-between text-primary/40">
                  {isEgg ? (
                    <span className="flex items-center gap-1.5 text-[#ff6a00] font-bold tracking-widest">
                      <Zap className="w-3 h-3" />
                      CORE.MEMORY // CLASSIFIED
                    </span>
                  ) : (
                    <span>MODEL: {p.modelUsed ?? p.model ?? "---"}</span>
                  )}
                  <span className="flex items-center gap-2">
                    {p.fromCache && <span className="text-[#ffaa00]">CACHED</span>}
                    {!isEgg && p.latencyMs != null && <span>{p.latencyMs}ms</span>}
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(p.response ?? "");
                        setCopiedIdx(i);
                        setTimeout(() => setCopiedIdx(null), 1500);
                      }}
                      className="opacity-0 group-hover/resp:opacity-100 transition-opacity text-primary/40 hover:text-primary/80"
                      title="Copy response"
                    >
                      {isCopied
                        ? <span className="flex items-center gap-1 text-[#22ff44]"><Check className="w-3 h-3" />COPIED</span>
                        : <Copy className="w-3 h-3" />
                      }
                    </button>
                  </span>
                </div>
                <div className={`whitespace-pre-wrap ${isEgg ? "text-[#ffa040] italic" : "text-primary/90"}`}>
                  {p.response ?? "---"}
                </div>
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
