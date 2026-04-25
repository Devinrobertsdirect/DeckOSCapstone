import { useState } from "react";
import {
  useGetAiRouterStatus, getGetAiRouterStatusQueryKey,
  useListAvailableModels, getListAvailableModelsQueryKey,
  useGetIntelligenceMode, getGetIntelligenceModeQueryKey,
  useSetIntelligenceMode,
  useRouteInference,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Brain, Zap, Database, Globe, CheckCircle2, XCircle, Loader2, ChevronRight } from "lucide-react";

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

export default function AiControl() {
  const [prompt, setPrompt] = useState("");
  const [inferMode, setInferMode] = useState<"fast" | "deep" | "none">("fast");
  const [output, setOutput] = useState<Array<{ text: string; model: string; latency: number; fromCache: boolean }>>([]);
  const qc = useQueryClient();

  const { data: status } = useGetAiRouterStatus({ query: { queryKey: getGetAiRouterStatusQueryKey(), refetchInterval: 5000 } });
  const { data: models } = useListAvailableModels({ query: { queryKey: getListAvailableModelsQueryKey(), refetchInterval: 10000 } });
  const { data: modeData } = useGetIntelligenceMode({ query: { queryKey: getGetIntelligenceModeQueryKey() } });
  const setMode = useSetIntelligenceMode();
  const infer = useRouteInference();

  const handleSetMode = (m: Mode) => {
    setMode.mutate({ data: { mode: m } }, {
      onSuccess: () => qc.invalidateQueries({ queryKey: getGetIntelligenceModeQueryKey() }),
    });
  };

  const handleInfer = (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim()) return;
    const p = prompt;
    setPrompt("");
    infer.mutate({ data: { prompt: p, mode: inferMode, useCache: true } }, {
      onSuccess: (res) => {
        setOutput((prev) => [{ text: res.response, model: res.modelUsed, latency: res.latencyMs, fromCache: res.fromCache }, ...prev].slice(0, 20));
      },
    });
  };

  return (
    <div className="flex flex-col gap-6 h-full">
      <div className="flex items-center gap-2 font-mono text-xs text-primary/60 uppercase tracking-widest">
        <Brain className="w-4 h-4 text-primary" />
        <span>AI.ROUTER // INTELLIGENCE CONTROL LAYER</span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatusTile label="OLLAMA.LOCAL" value={status?.ollamaAvailable ? "CONNECTED" : "OFFLINE"} ok={!!status?.ollamaAvailable} />
        <StatusTile label="CLOUD.API" value={status?.cloudAvailable ? "AVAILABLE" : "UNAVAILABLE"} ok={!!status?.cloudAvailable} />
        <StatusTile label="FALLBACK.MODE" value={status?.fallbackMode ? "ACTIVE" : "STANDBY"} ok={!status?.fallbackMode} invert />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Mode selector */}
        <Card className="bg-card/40 border-primary/20 rounded-none">
          <CardHeader className="border-b border-primary/20 p-4">
            <CardTitle className="font-mono text-sm text-primary">INTELLIGENCE.MODE</CardTitle>
          </CardHeader>
          <CardContent className="p-4 space-y-2">
            {MODES.map((m) => {
              const Icon = MODE_ICONS[m];
              const active = modeData?.mode === m;
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
            {modeData && (
              <p className="text-xs text-muted-foreground font-mono pt-2 border-t border-primary/20">{modeData.description}</p>
            )}
          </CardContent>
        </Card>

        {/* Model list */}
        <Card className="bg-card/40 border-primary/20 rounded-none">
          <CardHeader className="border-b border-primary/20 p-4">
            <CardTitle className="font-mono text-sm text-primary">AVAILABLE.MODELS</CardTitle>
          </CardHeader>
          <CardContent className="p-4 space-y-2">
            {models?.models.map((model) => (
              <div key={model.id} data-testid={`model-${model.id}`} className="flex items-center justify-between p-2 border border-primary/10 bg-background/50">
                <div>
                  <div className="font-mono text-xs text-primary">{model.name}</div>
                  <div className="font-mono text-xs text-muted-foreground">{model.type} // {model.tier} // {model.speed}</div>
                </div>
                <div className={`font-mono text-xs flex items-center gap-1 ${model.available ? "text-[#22ff44]" : "text-[#ff3333]"}`}>
                  {model.available ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                  {model.available ? "READY" : "UNAVAIL"}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* Inference console */}
      <Card className="flex-1 bg-card/40 border-primary/20 rounded-none flex flex-col min-h-0">
        <CardHeader className="border-b border-primary/20 p-4 flex-row items-center justify-between">
          <CardTitle className="font-mono text-sm text-primary">INFERENCE.CONSOLE</CardTitle>
          <div className="flex gap-2">
            {(["fast", "deep", "none"] as const).map((m) => (
              <button
                key={m}
                data-testid={`infer-mode-${m}`}
                onClick={() => setInferMode(m)}
                className={`font-mono text-xs px-3 py-1 border transition-all
                  ${inferMode === m ? "border-primary bg-primary/10 text-primary" : "border-primary/20 text-primary/50 hover:text-primary/80"}`}
              >
                {m.toUpperCase()}
              </button>
            ))}
          </div>
        </CardHeader>
        <div className="flex-1 overflow-y-auto p-4 space-y-3 font-mono text-xs min-h-0">
          {output.length === 0 && (
            <div className="text-primary/40">// Inference output will appear here. Submit a prompt to begin.</div>
          )}
          {output.map((item, i) => (
            <div key={i} className="border border-primary/10 p-3 bg-background/50 space-y-1">
              <div className="flex justify-between text-primary/40">
                <span>MODEL: {item.model}</span>
                <span className="flex gap-4">
                  {item.fromCache && <span className="text-[#ffaa00]">CACHED</span>}
                  <span>{item.latency}ms</span>
                </span>
              </div>
              <div className="text-primary/90 whitespace-pre-wrap">{item.text}</div>
            </div>
          ))}
          {infer.isPending && (
            <div className="flex items-center gap-2 text-primary/60">
              <Loader2 className="w-3 h-3 animate-spin" />
              <span>Processing inference...</span>
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
            disabled={infer.isPending}
            className="border border-primary/40 px-4 font-mono text-xs text-primary hover:bg-primary/10 transition-all disabled:opacity-50"
          >
            {infer.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : "SEND"}
          </button>
        </form>
      </Card>
    </div>
  );
}

function StatusTile({ label, value, ok, invert = false }: { label: string; value: string; ok: boolean; invert?: boolean }) {
  const isGood = invert ? !ok : ok;
  return (
    <div className="border border-primary/20 bg-card/40 p-4 font-mono">
      <div className="text-xs text-muted-foreground mb-1">{label}</div>
      <div className={`text-sm font-bold flex items-center gap-2 ${isGood ? "text-[#22ff44]" : "text-[#ff3333]"}`}>
        {isGood ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
        {value}
      </div>
      {label === "OLLAMA.LOCAL" && (
        <div className="text-xs text-muted-foreground mt-1">ENDPOINT: localhost:11434</div>
      )}
    </div>
  );
}
