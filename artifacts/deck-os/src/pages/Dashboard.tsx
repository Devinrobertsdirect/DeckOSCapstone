import { useGetSystemStats, getGetSystemStatsQueryKey, useGetSystemSummary, getGetSystemSummaryQueryKey, useGetAiRouterStatus, getGetAiRouterStatusQueryKey } from "@workspace/api-client-react";
import { Terminal, Cpu, MemoryStick, Activity, Network, Circle, Radio, Zap } from "lucide-react";
import { type LucideIcon } from "lucide-react";
import { useState, useEffect, useCallback } from "react";
import { Link } from "wouter";

export default function Dashboard() {
  const { data: stats, dataUpdatedAt: statsAt } = useGetSystemStats({
    query: { queryKey: getGetSystemStatsQueryKey(), refetchInterval: 3000 },
  });
  const { data: summary, dataUpdatedAt: summaryAt } = useGetSystemSummary({
    query: { queryKey: getGetSystemSummaryQueryKey(), refetchInterval: 5000 },
  });
  const { data: ai } = useGetAiRouterStatus({
    query: { queryKey: getGetAiRouterStatusQueryKey(), refetchInterval: 5000 },
  });

  return (
    <div className="flex flex-col h-full gap-4">
      {/* stat tiles */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        <MetricCard
          title="CPU.LOAD"
          value={`${stats?.cpu.usage.toFixed(1) ?? "0.0"}%`}
          icon={Cpu}
          updatedAt={statsAt}
          live
        />
        <MetricCard
          title="MEM.USAGE"
          value={`${stats?.memory.percentage.toFixed(1) ?? "0.0"}%`}
          icon={MemoryStick}
          updatedAt={statsAt}
          live
        />
        <MetricCard
          title="AI.MODE"
          value={ai?.mode ?? "UNKNOWN"}
          icon={Activity}
          highlight
          updatedAt={0}
          compact
        />
        <MetricCard
          title="PLUGINS.ACT"
          value={`${summary?.activePlugins ?? 0}/${summary?.totalPlugins ?? 0}`}
          icon={Network}
          updatedAt={summaryAt}
          live
        />
      </div>

      {/* COGNITIVE PULSE STRIP */}
      <PresenceStrip />

      {/* main content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 flex-1 min-h-0">
        {/* console */}
        <div className="col-span-2 flex flex-col border border-primary/20 bg-card/40 relative overflow-hidden">
          <HudCorners />
          <div className="border-b border-primary/20 bg-primary/5 p-3 flex items-center justify-between">
            <div className="font-mono text-xs text-primary flex items-center gap-2">
              <Terminal className="w-3.5 h-3.5" /> MAIN.CONSOLE
            </div>
            <LiveBadge />
          </div>
          <div className="flex-1 p-4 font-mono text-xs text-primary/70 space-y-1 overflow-y-auto">
            <ConsoleLine type="system">&gt; System initialized — SYS.VER.9.4.2</ConsoleLine>
            <ConsoleLine type="system">&gt; EventBus online — schema v1 enforced</ConsoleLine>
            <ConsoleLine type="ok">&gt; AI Router ready — mode: {ai?.mode ?? "DIRECT_EXECUTION"}</ConsoleLine>
            <ConsoleLine type="ok">&gt; Plugins loaded — {summary?.activePlugins ?? 0} active</ConsoleLine>
            <ConsoleLine type="ok">&gt; Memory service running — TTL sweeper active</ConsoleLine>
            {ai?.ollamaAvailable
              ? <ConsoleLine type="ok">&gt; Ollama detected — local inference enabled</ConsoleLine>
              : <ConsoleLine type="warn">&gt; Ollama not found — rule engine fallback active</ConsoleLine>}
          </div>
          <div className="p-3 border-t border-primary/20">
            <span className="font-mono text-xs text-primary/40">Navigate to CONSOLE for full command interface</span>
          </div>
        </div>

        {/* summary */}
        <div className="flex flex-col border border-primary/20 bg-card/40 relative overflow-hidden">
          <HudCorners />
          <div className="border-b border-primary/20 bg-primary/5 p-3 flex items-center justify-between">
            <div className="font-mono text-xs text-primary flex items-center gap-2">
              <Activity className="w-3.5 h-3.5" /> SYS.SUMMARY
            </div>
            <span className="font-mono text-xs text-primary/30">
              {summaryAt ? new Date(summaryAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "--"}
            </span>
          </div>
          <div className="p-4 font-mono text-xs space-y-3">
            <SummaryRow label="STATUS" value={summary?.status?.toUpperCase() ?? "OPTIMAL"} valueClass="text-[#00ff88]" />
            <SummaryRow label="ALERTS" value={String(summary?.alertCount ?? 0)} valueClass={(summary?.alertCount ?? 0) > 0 ? "text-[#ff3333]" : "text-primary/60"} />
            <SummaryRow label="UPTIME" value={formatUptime(summary?.uptimeSeconds ?? 0)} valueClass="text-primary" />
            <SummaryRow label="PLUGINS" value={`${summary?.activePlugins ?? 0} / ${summary?.totalPlugins ?? 0}`} valueClass="text-[#00d4ff]" />
            <SummaryRow label="AI CACHE" value={ai ? `${(ai.cacheHitRate * 100).toFixed(0)}% HIT` : "---"} valueClass="text-[#aa88ff]" />
            <SummaryRow label="REQUESTS" value={String(ai?.totalRequests ?? 0)} valueClass="text-primary/70" />
          </div>
          <div className="mt-auto p-4 border-t border-primary/10 space-y-1.5">
            <div className="font-mono text-xs text-primary/30 uppercase mb-2">INFERENCE</div>
            <StatusDot label="Ollama" active={ai?.ollamaAvailable ?? false} />
            <StatusDot label="Cloud API" active={ai?.cloudAvailable ?? false} />
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
  title, value, icon: Icon, highlight = false, updatedAt, live = false, compact = false,
}: {
  title: string;
  value: string | number;
  icon: LucideIcon;
  highlight?: boolean;
  updatedAt?: number;
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
          {live && updatedAt ? (
            <>
              <Circle className="w-1.5 h-1.5 fill-[#00ff88] text-[#00ff88]" />
              <span className="font-mono text-xs text-primary/30">
                {new Date(updatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
              </span>
            </>
          ) : compact ? (
            <span className="font-mono text-xs text-primary/20">ON-DEMAND</span>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function formatUptime(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}h ${m}m`;
}

const AVAIL_COLOR: Record<string, string> = { active: "#00ff88", idle: "#ffcc00", passive: "#00c8ff55" };

function PresenceStrip() {
  const [presence, setPresence] = useState<{ availability: string; activeChannel: string; minutesSinceLastInteraction: number } | null>(null);
  const [latestNudge, setLatestNudge] = useState<{ content: string; category: string; urgencyScore: number } | null>(null);
  const [nudgeCount, setNudgeCount] = useState(0);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`${window.location.origin}/api/presence`);
      if (!res.ok) return;
      const data = await res.json();
      setPresence(data.presence);
      const nudges = (data.nudges ?? []) as Array<{ content: string; category: string; urgencyScore: number; dismissed: boolean }>;
      const active = nudges.filter((n) => !n.dismissed);
      setNudgeCount(active.length);
      setLatestNudge(active[0] ?? null);
    } catch {}
  }, []);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const id = setInterval(() => void load(), 20_000);
    return () => clearInterval(id);
  }, [load]);

  const avColor = presence ? (AVAIL_COLOR[presence.availability] ?? "#00c8ff55") : "#00c8ff22";

  return (
    <div className="border border-primary/15 bg-card/30 px-4 py-2.5 flex items-center gap-4 font-mono text-xs">
      <div className="flex items-center gap-2 shrink-0">
        <Radio className="w-3.5 h-3.5 text-primary/50" />
        <span className="text-primary/40 uppercase tracking-wider">COGNITIVE.PULSE</span>
      </div>
      <div className="w-px h-4 bg-primary/10 shrink-0" />

      {/* presence */}
      <div className="flex items-center gap-1.5 shrink-0">
        <span className="text-primary/30">PRESENCE</span>
        <span className="font-bold uppercase" style={{ color: avColor }}>
          {presence ? presence.availability : "—"}
        </span>
        {presence && (
          <span className="text-primary/30">
            via {presence.activeChannel} · {presence.minutesSinceLastInteraction < 1 ? "now" : `${presence.minutesSinceLastInteraction}m ago`}
          </span>
        )}
      </div>

      <div className="w-px h-4 bg-primary/10 shrink-0" />

      {/* latest nudge */}
      <div className="flex-1 min-w-0 flex items-center gap-2">
        <Zap className="w-3 h-3 text-primary/30 shrink-0" />
        {latestNudge ? (
          <span className="text-primary/60 truncate">{latestNudge.content}</span>
        ) : (
          <span className="text-primary/20">No active nudges — monitoring</span>
        )}
        {nudgeCount > 0 && (
          <span className="shrink-0 border border-[#ffcc00]/40 text-[#ffcc00] px-1.5 py-0.5 text-xs">
            {nudgeCount} NUDGE{nudgeCount > 1 ? "S" : ""}
          </span>
        )}
      </div>

      <Link href="/pulse" className="shrink-0 text-primary/30 hover:text-primary transition-colors uppercase tracking-wider">
        PULSE →
      </Link>
    </div>
  );
}
