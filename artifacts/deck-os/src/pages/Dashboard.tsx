import { useEffect } from "react";
import { Terminal, Cpu, MemoryStick, Activity, Network, Circle, Radio, Zap } from "lucide-react";
import { type LucideIcon } from "lucide-react";
import { Link } from "wouter";
import { useWebSocket, useLatestPayload, useWsEvents } from "@/contexts/WebSocketContext";

type MetricsPayload = {
  cpu?: { usage?: number };
  memory?: { percentage?: number };
  uptime?: number;
};

type AiPayload = {
  mode?: string;
  ollamaAvailable?: boolean;
  cloudAvailable?: boolean;
  cacheHitRate?: number;
  totalRequests?: number;
};

type PluginPayload = {
  plugins?: Array<{ status?: string }>;
  count?: number;
};

export default function Dashboard() {
  const { sendEvent } = useWebSocket();

  const metrics = useLatestPayload<MetricsPayload>("system.monitor.metrics");
  const aiInferred = useLatestPayload<AiPayload>("ai.router.status");
  const pluginList = useLatestPayload<PluginPayload>("plugin.list.response");

  const consoleEvents = useWsEvents();
  const recentConsole = consoleEvents.slice(-6);

  useEffect(() => {
    sendEvent({ type: "system.monitor.request", payload: {} });
    sendEvent({ type: "plugin.list.request", payload: {} });
  }, [sendEvent]);

  const activePlugins = pluginList?.plugins?.filter((p) => p.status === "active").length ?? 0;
  const totalPlugins = pluginList?.plugins?.length ?? 0;

  return (
    <div className="flex flex-col h-full gap-4">
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        <MetricCard
          title="CPU.LOAD"
          value={`${(metrics?.cpu?.usage ?? 0).toFixed(1)}%`}
          icon={Cpu}
          live={!!metrics}
        />
        <MetricCard
          title="MEM.USAGE"
          value={`${(metrics?.memory?.percentage ?? 0).toFixed(1)}%`}
          icon={MemoryStick}
          live={!!metrics}
        />
        <MetricCard
          title="AI.MODE"
          value={aiInferred?.mode ?? "DIRECT_EXEC"}
          icon={Activity}
          highlight
          compact
        />
        <MetricCard
          title="PLUGINS.ACT"
          value={`${activePlugins}/${totalPlugins}`}
          icon={Network}
          live={!!pluginList}
        />
      </div>

      <PresenceStrip />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 flex-1 min-h-0">
        <div className="col-span-2 flex flex-col border border-primary/20 bg-card/40 relative overflow-hidden">
          <HudCorners />
          <div className="border-b border-primary/20 bg-primary/5 p-3 flex items-center justify-between">
            <div className="font-mono text-xs text-primary flex items-center gap-2">
              <Terminal className="w-3.5 h-3.5" /> MAIN.CONSOLE
            </div>
            <LiveBadge />
          </div>
          <div className="flex-1 p-4 font-mono text-xs text-primary/70 space-y-1 overflow-y-auto">
            {recentConsole.length === 0 ? (
              <>
                <ConsoleLine type="system">&gt; System initialized — SYS.VER.9.4.2</ConsoleLine>
                <ConsoleLine type="system">&gt; EventBus online — waiting for events</ConsoleLine>
              </>
            ) : (
              recentConsole.map((e, i) => {
                const t = e.type.startsWith("system") ? "system"
                  : e.type.startsWith("ai") ? "ok"
                  : e.type.includes("error") ? "error"
                  : e.type.startsWith("device") ? "ok"
                  : "system";
                return (
                  <ConsoleLine key={i} type={t}>
                    &gt; [{e.source ?? "bus"}] {e.type}
                  </ConsoleLine>
                );
              })
            )}
          </div>
          <div className="p-3 border-t border-primary/20">
            <span className="font-mono text-xs text-primary/40">Navigate to CONSOLE for full command interface</span>
          </div>
        </div>

        <div className="flex flex-col border border-primary/20 bg-card/40 relative overflow-hidden">
          <HudCorners />
          <div className="border-b border-primary/20 bg-primary/5 p-3 flex items-center justify-between">
            <div className="font-mono text-xs text-primary flex items-center gap-2">
              <Activity className="w-3.5 h-3.5" /> SYS.SUMMARY
            </div>
          </div>
          <div className="p-4 font-mono text-xs space-y-3">
            <SummaryRow label="STATUS" value="OPTIMAL" valueClass="text-[#00ff88]" />
            <SummaryRow label="UPTIME" value="ACTIVE" valueClass="text-primary" />
            <SummaryRow label="PLUGINS" value={`${activePlugins} / ${totalPlugins}`} valueClass="text-[#00d4ff]" />
            <SummaryRow label="AI CACHE" value={aiInferred ? `${((aiInferred.cacheHitRate ?? 0) * 100).toFixed(0)}% HIT` : "---"} valueClass="text-[#aa88ff]" />
            <SummaryRow label="REQUESTS" value={String(aiInferred?.totalRequests ?? 0)} valueClass="text-primary/70" />
          </div>
          <div className="mt-auto p-4 border-t border-primary/10 space-y-1.5">
            <div className="font-mono text-xs text-primary/30 uppercase mb-2">INFERENCE</div>
            <StatusDot label="Ollama" active={aiInferred?.ollamaAvailable ?? false} />
            <StatusDot label="Cloud API" active={aiInferred?.cloudAvailable ?? false} />
            <StatusDot label="Rule Engine" active />
          </div>
        </div>
      </div>
    </div>
  );
}

function HudCorners() {
  return (
    <>
      <span className="hud-corner hud-corner-tl" />
      <span className="hud-corner hud-corner-tr" />
      <span className="hud-corner hud-corner-bl" />
      <span className="hud-corner hud-corner-br" />
    </>
  );
}

function LiveBadge() {
  return (
    <div className="flex items-center gap-1 font-mono text-xs text-[#00ff88]">
      <Circle className="w-2 h-2 fill-[#00ff88] animate-pulse" />
      LIVE
    </div>
  );
}

function ConsoleLine({ children, type }: { children: React.ReactNode; type: "system" | "ok" | "warn" | "error" }) {
  const color = { system: "text-primary/60", ok: "text-[#00ff88]/70", warn: "text-[#ffaa00]/80", error: "text-[#ff3333]/80" }[type];
  return <div className={color}>{children}</div>;
}

function SummaryRow({ label, value, valueClass }: { label: string; value: string; valueClass: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}:</span>
      <span className={valueClass}>{value}</span>
    </div>
  );
}

function StatusDot({ label, active }: { label: string; active: boolean }) {
  return (
    <div className="flex items-center gap-2 font-mono text-xs">
      <Circle className={`w-1.5 h-1.5 fill-current ${active ? "text-[#00ff88]" : "text-primary/20"}`} />
      <span className={active ? "text-primary/60" : "text-primary/25"}>{label}</span>
    </div>
  );
}

function MetricCard({
  title, value, icon: Icon, highlight = false, live = false, compact = false,
}: {
  title: string;
  value: string | number;
  icon: LucideIcon;
  highlight?: boolean;
  live?: boolean;
  compact?: boolean;
}) {
  const str = String(value);
  const isLong = str.length > 10;
  const textSize = isLong ? "text-lg leading-tight" : "text-3xl";

  return (
    <div className={`relative border overflow-hidden metric-card-glow ${highlight ? "border-[#ffcc00]/40 bg-[#ffcc00]/5" : "border-primary/20 bg-primary/5"}`}>
      <HudCorners />
      <div className="p-4 flex flex-col gap-2 h-full min-h-[100px]">
        <div className="flex justify-between items-start">
          <span className="text-xs font-mono text-muted-foreground tracking-wider">{title}</span>
          <Icon className={`w-4 h-4 shrink-0 ${highlight ? "text-[#ffcc00]" : "text-primary/60"}`} />
        </div>
        <div className={`font-mono font-bold truncate metric-value ${textSize} ${highlight ? "text-[#ffcc00]" : "text-primary"}`} title={str}>
          {str}
        </div>
        <div className="mt-auto flex items-center gap-1.5">
          {live ? (
            <Circle className="w-1.5 h-1.5 fill-[#00ff88] text-[#00ff88]" />
          ) : compact ? (
            <span className="font-mono text-xs text-primary/20">ON-DEMAND</span>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function formatUptime(seconds: number): string {
  if (seconds < 60) return `${Math.floor(seconds)}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}h ${m}m`;
}

const AVAIL_COLOR: Record<string, string> = { active: "#00ff88", idle: "#ffcc00", passive: "#00c8ff55" };

function PresenceStrip() {
  const presenceEvent = useLatestPayload<{ presence?: { availability?: string; activeChannel?: string; minutesSinceLastInteraction?: number } }>( "system.heartbeat");

  const presence = presenceEvent?.presence;
  const avColor = presence ? (AVAIL_COLOR[presence.availability ?? ""] ?? "#00c8ff55") : "#00c8ff22";

  return (
    <div className="border border-primary/15 bg-card/30 px-4 py-2.5 flex items-center gap-4 font-mono text-xs">
      <div className="flex items-center gap-2 shrink-0">
        <Radio className="w-3.5 h-3.5 text-primary/50" />
        <span className="text-primary/40 uppercase tracking-wider">COGNITIVE.PULSE</span>
      </div>
      <div className="w-px h-4 bg-primary/10 shrink-0" />
      <div className="flex items-center gap-1.5 shrink-0">
        <span className="text-primary/30">PRESENCE</span>
        <span className="font-bold uppercase" style={{ color: avColor }}>
          {presence ? presence.availability : "MONITORING"}
        </span>
        {presence && (
          <span className="text-primary/30">
            via {presence.activeChannel} · {(presence.minutesSinceLastInteraction ?? 0) < 1 ? "now" : `${presence.minutesSinceLastInteraction}m ago`}
          </span>
        )}
      </div>
      <div className="w-px h-4 bg-primary/10 shrink-0" />
      <div className="flex-1 min-w-0 flex items-center gap-2">
        <Zap className="w-3 h-3 text-primary/30 shrink-0" />
        <span className="text-primary/20">Event stream active — monitoring all channels</span>
      </div>
      <Link href="/commands" className="shrink-0 text-primary/30 hover:text-primary transition-colors uppercase tracking-wider">
        CONSOLE →
      </Link>
    </div>
  );
}
