import { useState, useRef, useEffect, useCallback } from "react";
import { TerminalSquare, CheckCircle2, XCircle, Brain, Zap, Loader2, ChevronRight, Circle, Cpu } from "lucide-react";
import { VoiceMicButton } from "@/components/VoiceMicButton";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useWebSocket, useWsEvents } from "@/contexts/WebSocketContext";

type ChatResponsePayload = {
  response?: string;
  model?: string;
  modelUsed?: string;
  latencyMs?: number;
  fromCache?: boolean;
  requestId?: string;
  mode?: string;
};

type ChatRequestPayload = {
  prompt?: string;
  mode?: string;
  requestId?: string;
};

type ConsoleLine = {
  id: string;
  input: string;
  output?: string;
  model?: string;
  tier?: string;
  latencyMs?: number;
  fromCache?: boolean;
  aiAssisted?: boolean;
  pending?: boolean;
  thinkingModel?: string;
  thinkingTier?: string;
  streaming?: boolean;
  timestamp: string;
};

const AI_MODES = ["DIRECT_EXECUTION", "LIGHT_REASONING", "DEEP_REASONING", "HYBRID_MODE"] as const;
type AiMode = typeof AI_MODES[number];

export default function CommandConsole() {
  const { sendEvent } = useWebSocket();
  const [input, setInput] = useState("");
  const [localHistory, setLocalHistory] = useState<string[]>([]);
  const [historyIdx, setHistoryIdx] = useState(-1);
  const [aiMode, setAiMode] = useState<AiMode>("DIRECT_EXECUTION");
  const [lines, setLines] = useState<ConsoleLine[]>([]);
  const outputRef = useRef<HTMLDivElement>(null);

  const chatRequests   = useWsEvents((e) => e.type === "ai.chat.request");
  const chatTokens     = useWsEvents((e) => e.type === "ai.chat.token");
  const chatResponses  = useWsEvents((e) => e.type === "ai.chat.response");
  const inferStarted   = useWsEvents((e) => e.type === "ai.inference_started");
  const allEvents      = useWsEvents();
  const processedEvtKeysRef   = useRef(new Set<string>());
  const processedTokenKeysRef = useRef(new Set<string>());
  const [dotCycle, setDotCycle] = useState(0);

  // Animate the thinking dots while any line is pending
  const hasPendingLines = lines.some((l) => l.pending);
  useEffect(() => {
    if (!hasPendingLines) return;
    const id = setInterval(() => setDotCycle((c) => (c + 1) % 4), 400);
    return () => clearInterval(id);
  }, [hasPendingLines]);

  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [lines]);

  // When inference_started fires, update the matching pending line with tier/model
  useEffect(() => {
    inferStarted.forEach((evt) => {
      const p = evt.payload as { requestId?: string; tier?: string; model?: string };
      if (!p.requestId) return;
      setLines((prev) => {
        const idx = prev.findIndex((l) => l.id === p.requestId && l.pending);
        if (idx === -1) return prev;
        const updated = [...prev];
        updated[idx] = { ...updated[idx]!, thinkingTier: p.tier, thinkingModel: p.model };
        return updated;
      });
    });
  }, [inferStarted]);

  useEffect(() => {
    chatTokens.forEach((evt) => {
      const p = evt.payload as { requestId?: string; token?: string };
      const reqId = p.requestId;
      const token = p.token ?? "";
      if (!reqId || !token) return;

      const evtKey = `token:${reqId}:${evt.timestamp}:${evt.id ?? ""}`;
      if (processedTokenKeysRef.current.has(evtKey)) return;
      processedTokenKeysRef.current.add(evtKey);

      setLines((prev) => {
        const idx = prev.findIndex((l) => l.id === reqId);
        if (idx === -1) return prev;
        const current = prev[idx]!;
        const updated = [...prev];
        updated[idx] = {
          ...current,
          output: (current.output ?? "") + token,
          pending: false,
          streaming: true,
        };
        return updated;
      });
    });
  }, [chatTokens]);

  useEffect(() => {
    chatResponses.forEach((evt) => {
      const p = evt.payload as ChatResponsePayload;
      const reqId = p.requestId;
      if (!reqId) return;

      const evtKey = `${reqId}:${evt.timestamp}:${evt.id ?? ""}`;
      if (processedEvtKeysRef.current.has(evtKey)) return;
      processedEvtKeysRef.current.add(evtKey);

      setLines((prev) => {
        const idx = prev.findIndex((l) => l.id === reqId);
        if (idx === -1) return prev;
        const current = prev[idx]!;
        const updated = [...prev];
        updated[idx] = {
          ...current,
          output: current.output ?? p.response ?? "",
          model: p.modelUsed ?? p.model ?? current.model,
          latencyMs: p.latencyMs ?? current.latencyMs,
          fromCache: p.fromCache ?? current.fromCache,
          aiAssisted: true,
          pending: false,
          thinkingTier: undefined,
          thinkingModel: undefined,
          streaming: false,
        };
        return updated;
      });
    });
  }, [chatResponses]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;
    const cmd = input.trim();
    const requestId = `req-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    setLocalHistory((prev) => [cmd, ...prev].slice(0, 50));
    setHistoryIdx(-1);
    setInput("");

    const newLine: ConsoleLine = {
      id: requestId,
      input: cmd,
      pending: true,
      timestamp: new Date().toISOString(),
    };
    setLines((prev) => [...prev, newLine].slice(-100));

    sendEvent({
      type: "ai.chat.request",
      payload: { prompt: cmd, mode: aiMode, requestId },
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowUp") {
      e.preventDefault();
      const idx = Math.min(historyIdx + 1, localHistory.length - 1);
      setHistoryIdx(idx);
      setInput(localHistory[idx] ?? "");
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      const idx = Math.max(historyIdx - 1, -1);
      setHistoryIdx(idx);
      setInput(idx === -1 ? "" : (localHistory[idx] ?? ""));
    }
  };

  const hasPending = hasPendingLines;

  const handleVoiceTranscript = useCallback(async (transcript: string): Promise<string> => {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: transcript, channel: "voice", mode: aiMode }),
    });
    if (!res.ok) return "";
    const data = await res.json() as { response: string };

    const requestId = `voice-${Date.now()}`;
    setLines((prev) => [
      ...prev,
      {
        id: requestId,
        input: `[VOICE] ${transcript}`,
        output: data.response,
        aiAssisted: true,
        pending: false,
        timestamp: new Date().toISOString(),
      },
    ].slice(-100));

    return data.response ?? "";
  }, [aiMode]);

  const recentChatRequests = chatRequests.slice(-20).reverse();

  return (
    <div className="flex flex-col gap-6 h-full">
      <div className="flex items-center gap-2 font-mono text-xs text-primary/60 uppercase tracking-widest">
        <TerminalSquare className="w-4 h-4 text-primary" />
        <span>COMMAND.CONSOLE // AI EVENT ROUTER // DECK OS TERMINAL</span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 flex-1 min-h-0">
        <div className="col-span-3 flex flex-col gap-4 min-h-0">
          {/* Mode selector */}
          <div className="flex items-center gap-2 font-mono text-xs">
            <span className="text-primary/40">MODE:</span>
            {AI_MODES.map((m) => (
              <button
                key={m}
                onClick={() => {
                  setAiMode(m);
                  sendEvent({ type: "ai.mode.set", payload: { mode: m } });
                }}
                className={`px-3 py-1 border transition-all ${
                  aiMode === m ? "border-primary bg-primary/10 text-primary" : "border-primary/20 text-primary/40 hover:text-primary/70"
                }`}
              >
                {m.replace("_", ".")}
              </button>
            ))}
          </div>

          <Card className="flex-1 bg-card/40 border-primary/20 rounded-none flex flex-col min-h-0">
            <CardHeader className="border-b border-primary/20 p-3 flex-row items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-[#22ff44] animate-pulse" />
                <CardTitle className="font-mono text-xs text-primary">DECK OS TERMINAL v9.4.2 // WS EVENT MODE</CardTitle>
              </div>
              <div className="font-mono text-xs text-muted-foreground flex items-center gap-2">
                <Circle className="w-1.5 h-1.5 fill-[#00ff88] text-[#00ff88]" />
                {allEvents.length} EVENTS
              </div>
            </CardHeader>
            <div ref={outputRef} className="flex-1 overflow-y-auto p-4 font-mono text-xs space-y-3 min-h-0">
              <div className="text-primary/40">
                DECK OS initialized. Commands are sent as ai.chat.request events. Responses arrive via ai.chat.response.
              </div>
              <div className="text-primary/40">Use UP/DOWN arrows to navigate command history.</div>
              <div className="text-primary/40">---</div>

              {lines.map((line) => (
                <div key={line.id} className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[#ffaa00]">&gt;</span>
                    <span className="text-primary">{line.input}</span>
                    <span className="text-primary/20 ml-auto">{new Date(line.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</span>
                  </div>
                  {line.pending ? (
                    <div className="pl-4 flex items-center gap-2 text-primary/70 font-mono text-xs">
                      {line.thinkingTier ? (
                        <>
                          <Cpu className="w-3 h-3 text-[#cc44ff] animate-pulse" />
                          <span className={`uppercase font-bold ${
                            line.thinkingTier === "cortex"    ? "text-[#cc44ff]"
                          : line.thinkingTier === "reflex"    ? "text-[#ffc820]"
                          : "text-[#11d97a]"
                          }`}>{line.thinkingTier}</span>
                          <span className="text-primary/30">•</span>
                          <span className="text-primary/60">{line.thinkingModel}</span>
                          <span className="text-primary/30">•</span>
                          <span className="text-primary/50 tracking-widest">
                            {"THINKING" + "•".repeat(dotCycle)}
                          </span>
                        </>
                      ) : (
                        <>
                          <Loader2 className="w-3 h-3 animate-spin text-primary/40" />
                          <span className="text-primary/40">
                            {"ROUTING" + "•".repeat(dotCycle)}
                          </span>
                        </>
                      )}
                    </div>
                  ) : line.output !== undefined ? (
                    <>
                      <div className="pl-4 whitespace-pre-wrap text-primary/80">
                        {line.output}
                        {line.streaming && (
                          <span className="inline-block w-[2px] h-[1em] bg-primary align-middle ml-[1px] animate-[blink_1s_step-end_infinite]" />
                        )}
                      </div>
                      {!line.streaming && (
                        <div className="pl-4 flex items-center gap-3 text-primary/30">
                          <CheckCircle2 className="w-3 h-3 text-[#22ff44]" />
                          {line.latencyMs !== undefined && <span>{line.latencyMs}ms</span>}
                          {line.model && <span>MODEL: {line.model}</span>}
                          {line.fromCache && <span className="text-[#ffaa00]">CACHED</span>}
                          {line.aiAssisted && (
                            <span className="flex items-center gap-1 text-[#cc44ff]"><Brain className="w-3 h-3" /> AI-ASSISTED</span>
                          )}
                        </div>
                      )}
                    </>
                  ) : null}
                </div>
              ))}
            </div>
            <form onSubmit={handleSubmit} className="border-t border-primary/30 p-4 flex items-center gap-2 bg-background/50">
              <span className="text-[#ffaa00] font-mono text-sm font-bold">&gt;_</span>
              <Input
                data-testid="terminal-input"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                className="font-mono border-none bg-transparent focus-visible:ring-0 text-primary px-0 flex-1"
                placeholder="Enter command — sent as ai.chat.request event..."
                autoFocus
              />
              <VoiceMicButton
                onTranscript={handleVoiceTranscript}
                disabled={hasPending}
              />
              <button
                type="submit"
                data-testid="terminal-submit"
                disabled={hasPending}
                className="border border-primary/40 px-4 py-1.5 font-mono text-xs text-primary hover:bg-primary/10 transition-all disabled:opacity-50 flex items-center gap-1"
              >
                {hasPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <ChevronRight className="w-3 h-3" />}
                SEND
              </button>
            </form>
          </Card>
        </div>

        <div className="flex flex-col gap-4 min-h-0">
          <Card className="bg-card/40 border-primary/20 rounded-none">
            <CardHeader className="border-b border-primary/20 p-3">
              <CardTitle className="font-mono text-xs text-primary">EVENT.TYPES</CardTitle>
            </CardHeader>
            <CardContent className="p-3 space-y-1">
              {[
                { type: "ai.chat.request", color: "text-[#cc44ff]", desc: "Outbound — prompt" },
                { type: "ai.chat.response", color: "text-[#22ff44]", desc: "Inbound — result" },
                { type: "ai.inference_started", color: "text-[#ffaa00]", desc: "Processing" },
                { type: "ai.inference_completed", color: "text-[#00d4ff]", desc: "Done" },
              ].map(({ type, color, desc }) => (
                <div key={type} className="font-mono text-xs p-1.5 border border-primary/10">
                  <div className={color}>{type}</div>
                  <div className="text-primary/30">{desc}</div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="bg-card/40 border-primary/20 rounded-none flex-1 min-h-0 flex flex-col">
            <CardHeader className="border-b border-primary/20 p-3">
              <CardTitle className="font-mono text-xs text-primary">RECENT.REQUESTS</CardTitle>
            </CardHeader>
            <div className="flex-1 overflow-y-auto p-3 space-y-1 min-h-0">
              {recentChatRequests.length === 0 && (
                <div className="font-mono text-xs text-primary/30">No requests yet</div>
              )}
              {recentChatRequests.map((evt, i) => {
                const p = evt.payload as ChatRequestPayload;
                return (
                  <button
                    key={i}
                    data-testid={`history-${i}`}
                    onClick={() => setInput(p.prompt ?? "")}
                    className="w-full text-left font-mono text-xs p-1.5 hover:bg-primary/5 border border-transparent hover:border-primary/20 transition-all"
                  >
                    <div className="flex items-center gap-2">
                      <Zap className="w-3 h-3 text-[#ffaa00] flex-shrink-0" />
                      <span className="text-primary/80 truncate">{p.prompt}</span>
                    </div>
                    <div className="text-primary/30 pl-5">{new Date(evt.timestamp).toLocaleTimeString()}</div>
                  </button>
                );
              })}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
