import { useEffect, useState, useMemo, useRef } from "react";
import { getStoredConfig, applyColor, getStoredColor, type ColorScheme } from "@/components/Onboarding";
import { useAiName } from "@/hooks/useAiName";
import { AIFace, useFaceStyle } from "@/components/AIFace";
import { Link, useLocation } from "wouter";
import {
  Activity, HardDrive, Cpu as Microchip, Network, Settings,
  TerminalSquare, AlertTriangle, CheckCircle2,
  ChevronRight, Layers, Eye, Minimize2, Film, List,
  Camera, CameraOff, Shield, Zap, Map, MapPin, Bot, Clock, Newspaper, Package, GitBranch,
} from "lucide-react";
import { useCamera } from "@/hooks/useCamera";
import { useHealthCheck, getHealthCheckQueryKey } from "@workspace/api-client-react";
import { useVisualMode, type VisualMode } from "@/contexts/VisualMode";
import { useWebSocket, useLatestPayload } from "@/contexts/WebSocketContext";
import { EventLogPanel } from "@/components/EventLogPanel";
import { ParticleOverlay } from "@/components/ParticleOverlay";
import { useQuery } from "@tanstack/react-query";
import { DeviceDiscovery } from "@/components/DeviceDiscovery";
import { NotificationBell, NotificationDrawer, fetchNotifications } from "@/components/NotificationDrawer";

interface AutonomyConfig {
  enabled: boolean;
  safetyLevel: string;
  confirmationRequired: boolean;
  allowedActions: string[];
  blockedActions: string[];
}

interface ActionFlash {
  id: number;
  label: string;
  detail: string;
}

const CORE_DISPLAYS: { key: string; label: string }[] = [
  { key: "refresh_memory",   label: "store memories" },
  { key: "send_notification", label: "send nudges"   },
  { key: "generate_summary", label: "suggest steps"  },
  { key: "query_goals",      label: "read goals"     },
];

function eventToAction(type: string, payload: Record<string, unknown>): ActionFlash | null {
  if (type === "memory.stored") {
    const layer = payload.layer as string | undefined;
    return { id: Date.now(), label: "stored to memory", detail: layer ? `layer: ${layer}` : "identity layer updated" };
  }
  if (type === "initiative.nudge_created") {
    const cat = payload.category as string | undefined;
    return { id: Date.now(), label: "nudge fired", detail: cat ?? "initiative engine" };
  }
  if (type === "system.config_changed") {
    const comp = payload.component as string | undefined;
    return { id: Date.now(), label: "config updated", detail: comp ?? "system" };
  }
  return null;
}

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [autonomyOpen, setAutonomyOpen] = useState(false);
  const [eventLogOpen, setEventLogOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const { mode, setMode, particlePrefs, setParticlePrefs } = useVisualMode();
  const cfg      = useMemo(() => getStoredConfig(), []);
  const userName = cfg?.userName ?? null;
  const aiName   = useAiName();
  const [activeColor, setActiveColor] = useState<ColorScheme>(getStoredColor());
  const [now, setNow] = useState(() => new Date());
  const { status: wsStatus, events } = useWebSocket();
  const faceStyle = useFaceStyle();
  const [aiSpeaking, setAiSpeaking] = useState(false);
  const speakTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const routerStatus = useLatestPayload<{ ollamaAvailable?: boolean; mode?: string }>("ai.router.status");
  const wsOllamaOnline = routerStatus === null ? null : (routerStatus?.ollamaAvailable ?? false);
  const [httpOllamaOnline, setHttpOllamaOnline] = useState<boolean | null>(null);
  const [ollamaBannerDismissed, setOllamaBannerDismissed] = useState(false);
  const ollamaOnline = wsOllamaOnline ?? httpOllamaOnline;
  const showOllamaBanner = ollamaOnline === false && !ollamaBannerDismissed;
  const camera = useCamera();
  const [autonomyConfig, setAutonomyConfig] = useState<AutonomyConfig | null>(null);
  const [recentActions, setRecentActions] = useState<ActionFlash[]>([]);
  const lastEventCount = useRef(0);

  useEffect(() => {
    document.documentElement.classList.add("dark");
    applyColor(getStoredColor());

    fetch("/api/autonomy/config")
      .then((r) => r.json())
      .then((d) => setAutonomyConfig(d as AutonomyConfig))
      .catch(() => {});

    fetchNotifications()
      .then((d) => setUnreadCount(d.unreadCount ?? 0))
      .catch(() => {});

    async function pollAiStatus() {
      try {
        const r = await fetch("/api/ai-router/status");
        if (r.ok) {
          const d = (await r.json()) as { ollamaAvailable?: boolean };
          setHttpOllamaOnline(d.ollamaAvailable ?? false);
        }
      } catch {
        setHttpOllamaOnline(false);
      }
    }

    pollAiStatus();
    const iv = setInterval(pollAiStatus, 30_000);
    return () => clearInterval(iv);
  }, []);

  useEffect(() => {
    if (events.length === lastEventCount.current) return;
    const newEvents = events.slice(lastEventCount.current);
    lastEventCount.current = events.length;

    for (const ev of newEvents) {
      const typed = ev as { type?: string; payload?: Record<string, unknown> };
      if (!typed.type) continue;
      const action = eventToAction(typed.type, typed.payload ?? {});
      if (action) {
        setRecentActions((prev) => [action, ...prev].slice(0, 3));
      }
      if (
        typed.type === "ai.response" ||
        typed.type === "ai.chat.response" ||
        typed.type === "ai.stream.token" ||
        typed.type === "tts.started"
      ) {
        setAiSpeaking(true);
        if (speakTimerRef.current) clearTimeout(speakTimerRef.current);
        speakTimerRef.current = setTimeout(() => setAiSpeaking(false), 4000);
      }
    }
  }, [events]);

  useEffect(() => {
    const iv = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(iv);
  }, []);

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement).tagName.toLowerCase();
      if (tag === "input" || tag === "textarea") return;
      if (e.key === "e" || e.key === "E") {
        setEventLogOpen((o) => !o);
      }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, []);

  async function toggleAutonomy() {
    if (!autonomyConfig) return;
    const next = { ...autonomyConfig, enabled: !autonomyConfig.enabled };
    setAutonomyConfig(next);
    try {
      await fetch("/api/autonomy/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: next.enabled }),
      });
    } catch {}
  }

  async function cycleSafetyLevel() {
    if (!autonomyConfig) return;
    const levels = ["strict", "moderate", "permissive"] as const;
    const idx  = levels.indexOf(autonomyConfig.safetyLevel as "strict" | "moderate" | "permissive");
    const next = { ...autonomyConfig, safetyLevel: levels[(idx + 1) % levels.length] };
    setAutonomyConfig(next);
    try {
      await fetch("/api/autonomy/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ safetyLevel: next.safetyLevel }),
      });
    } catch {}
  }

  function changeColor(c: ColorScheme) {
    setActiveColor(c);
    applyColor(c);
    if (cfg) {
      const updated = { ...cfg, color: c };
      localStorage.setItem("jarvis.user", JSON.stringify(updated));
    }
  }

  const { data: health } = useHealthCheck({
    query: {
      queryKey: getHealthCheckQueryKey(),
      refetchInterval: 10000,
    },
  });

  const isOnline = health?.status === "ok" || health?.status === "online" || !!health;

  const wsColor = wsStatus === "connected" ? "text-[#00ff88]" : wsStatus === "connecting" ? "text-[#ffaa00]" : "text-[#ff3333]";

  const { data: trackerData } = useQuery<{ devices: { device_id: string; created_at: string }[] }>({
    queryKey: ["location-latest"],
    queryFn:  () => fetch(`${import.meta.env.BASE_URL}api/location/latest`).then(r => r.json()),
    refetchInterval: 15_000,
  });
  const activeTrackers = (trackerData?.devices ?? []).filter(d =>
    Date.now() - new Date(d.created_at).getTime() < 5 * 60_000,
  ).length;

  const navSections = [
    {
      label: "SYSTEM",
      items: [
        { href: "/",        icon: Activity,       label: "SYS.HUD"   },
        { href: "/ai",             icon: Microchip,      label: "AI.ROUTER" },
        { href: "/ai/personality", icon: Bot,            label: "AI.PERSONA" },
        { href: "/plugins", icon: Settings,        label: "PLUGINS"   },
        { href: "/plugins/store", icon: Package,     label: "PLUGIN.STORE" },
        { href: "/memory",  icon: HardDrive,       label: "MEMORY.BANK" },
        { href: "/devices", icon: Network,         label: "DEVICES"   },
        { href: "/commands",  icon: TerminalSquare,  label: "CONSOLE"   },
        { href: "/routines",   icon: Clock,           label: "ROUTINES"  },
        { href: "/briefings",  icon: Newspaper,       label: "BRIEFINGS" },
        { href: "/timeline",   icon: GitBranch,       label: "TIMELINE"  },
        { href: "/settings",   icon: Settings,        label: "SETTINGS"  },
      ],
    },
    {
      label: "SPATIAL",
      items: [
        { href: "/map", icon: Map, label: "SPATIAL.MAP" },
      ],
    },
  ];

  return (
    <div className="min-h-screen flex flex-col overflow-hidden relative">
      <div className="scanline z-50" />

      {/* ── Cinematic overlay layers (CSS hides unless cinematic mode) ── */}
      <div className="cinematic-vignette"      aria-hidden="true" />
      <div className="cinematic-blob cinematic-blob-1" aria-hidden="true" />
      <div className="cinematic-blob cinematic-blob-2" aria-hidden="true" />
      <div className="cinematic-noise"         aria-hidden="true" />
      <div className="cinematic-scanline-2"    aria-hidden="true" />

      {/* Device Discovery — fixed overlay, mounts above content */}
      <DeviceDiscovery />

      {/* HEADER */}
      <header className="h-14 border-b border-primary/30 flex items-center px-5 justify-between bg-card/80 backdrop-blur shrink-0 relative z-40">
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 rounded-full border-2 border-primary flex items-center justify-center pulse-glow">
            <Activity className="w-4 h-4 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-primary tracking-widest uppercase m-0 leading-none">Deck OS</h1>
            <p className="text-xs text-primary/50 font-mono">SYS.VER.9.4.2 // {aiName}</p>
          </div>
        </div>

        <div className="flex items-center gap-5 font-mono text-xs">
          <div className="hidden sm:flex items-center gap-1.5 text-primary/50">
            <span className="uppercase tracking-wider">VISUAL</span>
            <span className="text-primary">{mode.toUpperCase()}</span>
          </div>
          {/* WS status */}
          <div className="flex items-center gap-1.5">
            <span className="text-muted-foreground">WS</span>
            <span className={`${wsColor} flex items-center gap-1`}>
              <span className={`w-1.5 h-1.5 rounded-full inline-block ${wsStatus === "connected" ? "bg-[#00ff88] animate-pulse" : wsStatus === "connecting" ? "bg-[#ffaa00] animate-pulse" : "bg-[#ff3333]"}`} />
              {wsStatus.toUpperCase()}
            </span>
            <span className="text-primary/30">({events.length})</span>
          </div>
          {/* Tracker count */}
          {activeTrackers > 0 && (
            <div className="hidden sm:flex items-center gap-1.5 text-[#11d97a]">
              <MapPin className="w-3 h-3 animate-pulse" />
              <span className="font-mono">{activeTrackers}</span>
              <span className="text-primary/40 uppercase">TRACKER{activeTrackers !== 1 ? "S" : ""}</span>
            </div>
          )}
          {/* API status */}
          <div className="flex items-center gap-1.5">
            <span className="text-muted-foreground">API</span>
            {isOnline ? (
              <span className="text-[#00ff88] flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" /> OK
              </span>
            ) : (
              <span className="text-[#ff3333] flex items-center gap-1">
                <AlertTriangle className="w-3.5 h-3.5" /> DOWN
              </span>
            )}
          </div>
          {/* Color switcher */}
          <div className="hidden sm:flex items-center gap-1.5">
            {(["blue", "green", "yellow", "red"] as ColorScheme[]).map((c) => {
              const HEX: Record<ColorScheme, string> = { blue: "#3f84f3", green: "#11d97a", yellow: "#ffc820", red: "#f03248" };
              return (
                <button
                  key={c}
                  title={c.toUpperCase()}
                  onClick={() => changeColor(c)}
                  className={`w-3 h-3 rounded-full transition-all duration-200
                    ${activeColor === c ? "scale-125 ring-1 ring-white/30" : "opacity-40 hover:opacity-80"}`}
                  style={{ backgroundColor: HEX[c] }}
                />
              );
            })}
          </div>
          {/* Camera status */}
          {camera.supported && (
            <button
              onClick={camera.toggle}
              title={camera.enabled ? "Camera active — click to disable" : "Enable environmental camera"}
              className={`flex items-center gap-1.5 px-2 py-1 border transition-all font-mono text-xs ${
                camera.status === "active"
                  ? "border-primary/50 bg-primary/10 text-primary"
                  : "border-primary/20 text-primary/30 hover:text-primary/60"
              }`}
            >
              {camera.status === "active" ? (
                <Camera className="w-3 h-3" />
              ) : (
                <CameraOff className="w-3 h-3" />
              )}
              {camera.isCapturing && (
                <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse inline-block" />
              )}
            </button>
          )}
          {/* Notification bell */}
          <NotificationBell
            onClick={() => setNotifOpen((o) => !o)}
            unreadCount={unreadCount}
          />
          {/* Event log toggle */}
          <button
            onClick={() => setEventLogOpen((o) => !o)}
            title="Event Log (E)"
            className={`flex items-center gap-1.5 px-2 py-1 border transition-all font-mono text-xs ${
              eventLogOpen ? "border-primary bg-primary/10 text-primary" : "border-primary/20 text-primary/40 hover:text-primary/70"
            }`}
          >
            <List className="w-3 h-3" />
            <span className="hidden sm:inline">LOG</span>
          </button>
          <div className="text-primary tabular-nums">
            {now.toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" })}
          </div>
        </div>
      </header>

      {/* ── Ollama offline banner ─────────────────────────────────────────── */}
      {showOllamaBanner && (
        <div className="relative z-40 flex items-center gap-3 px-4 py-2 bg-[#ffc820]/10 border-b border-[#ffc820]/40 font-mono text-xs text-[#ffc820]">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 animate-pulse" />
          <span>
            <span className="font-bold uppercase tracking-wider">OLLAMA OFFLINE</span>
            {" — "}AI running in rule-engine fallback. Start Ollama locally to enable LLM responses.
            <span className="ml-2 text-[#ffc820]/60">Run: <code className="text-[#ffc820]">ollama serve</code></span>
          </span>
          <button
            onClick={() => setOllamaBannerDismissed(true)}
            className="ml-auto text-[#ffc820]/50 hover:text-[#ffc820] transition-colors px-1"
            title="Dismiss"
          >
            ✕
          </button>
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">
        {/* SIDEBAR */}
        <aside className="w-52 border-r border-primary/30 bg-card/50 flex flex-col overflow-y-auto shrink-0 relative z-30">
          {/* AI FACE — persistent animated identity */}
          <div
            className="border-b border-primary/15 flex flex-col items-center py-3 gap-1.5"
            style={{ background: "rgba(var(--primary-rgb),0.02)" }}
          >
            <div
              className="flex items-center justify-center transition-all"
              style={{
                padding: faceStyle === "iris" ? "4px" : "6px 0",
                filter: aiSpeaking ? "drop-shadow(0 0 6px rgba(var(--primary-rgb),0.6))" : "none",
              }}
            >
              <AIFace
                style={faceStyle}
                speaking={aiSpeaking}
                size={faceStyle === "iris" ? 48 : 80}
                color="var(--color-primary)"
              />
            </div>
            <div
              className="font-mono text-xs tracking-widest uppercase"
              style={{
                color: aiSpeaking ? "var(--color-primary)" : "rgba(var(--primary-rgb),0.4)",
                fontSize: "0.6rem",
                transition: "color 0.3s",
              }}
            >
              {aiSpeaking ? "TRANSMITTING" : aiName}
            </div>
          </div>

          <div className="flex-1 p-2 pt-3 flex flex-col gap-0.5">
            {navSections.map((section) => (
              <div key={section.label}>
                <div className="font-mono text-xs text-primary/25 uppercase tracking-widest px-2 py-1.5 flex items-center gap-1">
                  <ChevronRight className="w-3 h-3" />{section.label}
                </div>
                {section.items.map(({ href, icon, label }) => (
                  <NavLink key={href} href={href} icon={icon} label={label} active={location === href} />
                ))}
              </div>
            ))}

            {/* Event log sidebar button */}
            <div className="mt-2">
              <div className="font-mono text-xs text-primary/25 uppercase tracking-widest px-2 py-1.5 flex items-center gap-1">
                <ChevronRight className="w-3 h-3" />TOOLS
              </div>
              <button
                onClick={() => setEventLogOpen((o) => !o)}
                className={`w-full flex items-center gap-2 px-3 py-2 border font-mono text-xs transition-all nav-link ${
                  eventLogOpen
                    ? "border-primary/50 bg-primary/10 text-primary nav-active"
                    : "border-transparent text-muted-foreground hover:border-primary/30 hover:text-foreground"
                }`}
              >
                <List className="w-3.5 h-3.5 shrink-0" />
                <span className="tracking-wider">EVENT.LOG</span>
                <span className="ml-auto text-primary/25 text-xs">[E]</span>
              </button>
            </div>
          </div>

          {/* SETTINGS SECTION */}
          <div className="border-t border-primary/20 p-2">
            <button
              onClick={() => setSettingsOpen((o) => !o)}
              className="w-full flex items-center gap-2 px-3 py-2 font-mono text-xs text-primary/50 hover:text-primary transition-colors border border-transparent hover:border-primary/20"
            >
              <Layers className="w-3.5 h-3.5" />
              <span className="tracking-wider uppercase">Visual Mode</span>
              <ChevronRight className={`w-3 h-3 ml-auto transition-transform duration-200 ${settingsOpen ? "rotate-90" : ""}`} />
            </button>

            {settingsOpen && (
              <div className="mt-1 space-y-1 px-1">
                <VisualModeOption
                  current={mode}
                  value="minimal"
                  label="MINIMAL"
                  desc="Clean, no effects"
                  icon={Minimize2}
                  onSelect={setMode}
                />
                <VisualModeOption
                  current={mode}
                  value="standard"
                  label="STANDARD"
                  desc="Default HUD"
                  icon={Eye}
                  onSelect={setMode}
                />
                <VisualModeOption
                  current={mode}
                  value="cinematic"
                  label="CINEMATIC"
                  desc="Enhanced + glow"
                  icon={Film}
                  onSelect={setMode}
                />

                {mode === "cinematic" && (
                  <div className="mt-2 border border-primary/15 bg-background/40 px-2.5 py-2 font-mono text-xs">
                    <div className="text-primary/35 uppercase tracking-wider text-[10px] mb-2">Particles</div>

                    <div className="mb-2">
                      <div className="flex justify-between text-[10px] mb-1">
                        <span className="text-primary/40 uppercase tracking-wider">Density</span>
                        <span className="text-primary/70">{particlePrefs.density}%</span>
                      </div>
                      <input
                        type="range"
                        min={10}
                        max={300}
                        step={10}
                        value={particlePrefs.density}
                        onChange={(e) => setParticlePrefs({ density: Number(e.target.value) })}
                        className="w-full h-1 appearance-none bg-primary/15 rounded accent-primary cursor-pointer"
                      />
                      <div className="flex justify-between text-[9px] text-primary/20 mt-0.5">
                        <span>sparse</span>
                        <span>dense</span>
                      </div>
                    </div>

                    <div>
                      <div className="flex justify-between text-[10px] mb-1">
                        <span className="text-primary/40 uppercase tracking-wider">Speed</span>
                        <span className="text-primary/70">{particlePrefs.speed}%</span>
                      </div>
                      <input
                        type="range"
                        min={10}
                        max={300}
                        step={10}
                        value={particlePrefs.speed}
                        onChange={(e) => setParticlePrefs({ speed: Number(e.target.value) })}
                        className="w-full h-1 appearance-none bg-primary/15 rounded accent-primary cursor-pointer"
                      />
                      <div className="flex justify-between text-[9px] text-primary/20 mt-0.5">
                        <span>slow</span>
                        <span>fast</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="mt-2 border border-primary/20 p-2.5 bg-background/50 font-mono text-xs">
              <div className="text-primary/40 mb-1 uppercase text-xs tracking-wider">Override</div>
              {userName && (
                <div className="flex justify-between mb-0.5">
                  <span className="text-primary/40">CMDR:</span>
                  <span className="text-primary uppercase tracking-wider truncate max-w-[80px]">{userName}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-primary/40">Level:</span>
                <span className="text-[#ffcc00]">ALPHA</span>
              </div>
              <div className="flex justify-between">
                <span className="text-primary/40">Protocol:</span>
                <span className="text-primary">SECURE</span>
              </div>
            </div>

            {camera.supported && (
              <div className="mt-2 border border-primary/20 p-2.5 bg-background/50 font-mono text-xs">
                <div className="text-primary/40 mb-1.5 uppercase text-xs tracking-wider">Environment</div>
                <button
                  onClick={camera.toggle}
                  className={`w-full flex items-center gap-2 px-2 py-1.5 border text-xs font-mono transition-all ${
                    camera.status === "active"
                      ? "border-primary/50 bg-primary/10 text-primary"
                      : camera.status === "denied"
                      ? "border-red-500/30 text-red-400/60 cursor-not-allowed"
                      : "border-primary/20 text-primary/40 hover:border-primary/40 hover:text-primary/70"
                  }`}
                  disabled={camera.status === "denied"}
                >
                  {camera.status === "active" ? (
                    <Camera className="w-3 h-3 shrink-0" />
                  ) : (
                    <CameraOff className="w-3 h-3 shrink-0" />
                  )}
                  <span className="tracking-wider">
                    {camera.status === "active"    ? "VISION ACTIVE"    :
                     camera.status === "requesting" ? "REQUESTING..."    :
                     camera.status === "denied"     ? "ACCESS DENIED"   :
                     camera.status === "unsupported"? "NOT SUPPORTED"   : "VISION OFF"}
                  </span>
                  {camera.status === "active" && (
                    <span className="ml-auto w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                  )}
                </button>
                {camera.lastDescription && (
                  <div className="mt-1.5 text-primary/35 text-[10px] leading-relaxed line-clamp-2">
                    {camera.lastDescription}
                  </div>
                )}
              </div>
            )}

            {/* AUTONOMY CONTROLS */}
            <div className="mt-2 border border-primary/20 bg-background/50 font-mono text-xs">
              <button
                onClick={() => setAutonomyOpen((o) => !o)}
                className="w-full flex items-center gap-2 px-2.5 py-2 text-primary/50 hover:text-primary transition-colors"
              >
                <Shield className="w-3 h-3 shrink-0" />
                <span className="tracking-wider uppercase">Autonomy</span>
                {autonomyConfig && (
                  <span className={`ml-auto text-[10px] ${autonomyConfig.enabled ? "text-[#00ff88]" : "text-primary/25"}`}>
                    {autonomyConfig.enabled ? "ON" : "OFF"}
                  </span>
                )}
                <ChevronRight className={`w-3 h-3 transition-transform duration-200 ${autonomyOpen ? "rotate-90" : ""}`} />
              </button>

              {autonomyOpen && autonomyConfig && (
                <div className="px-2.5 pb-2.5 space-y-2 border-t border-primary/10 pt-2">
                  <div className="flex items-center justify-between">
                    <span className="text-primary/40">Enabled</span>
                    <button
                      onClick={toggleAutonomy}
                      className={`px-2 py-0.5 border text-[10px] transition-colors ${autonomyConfig.enabled ? "border-[#00ff88]/40 text-[#00ff88] bg-[#00ff88]/5" : "border-primary/20 text-primary/30"}`}
                    >
                      {autonomyConfig.enabled ? "ON" : "OFF"}
                    </button>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-primary/40">Safety</span>
                    <button
                      onClick={cycleSafetyLevel}
                      className="px-2 py-0.5 border border-primary/20 text-primary/60 text-[10px] hover:border-primary/40 transition-colors"
                      title="Click to cycle safety level"
                    >
                      {autonomyConfig.safetyLevel.toUpperCase()}
                    </button>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-primary/40">Confirm</span>
                    <span className={`text-[10px] ${autonomyConfig.confirmationRequired ? "text-[#ffcc00]" : "text-primary/30"}`}>
                      {autonomyConfig.confirmationRequired ? "REQUIRED" : "NONE"}
                    </span>
                  </div>
                  <div className="pt-1.5 border-t border-primary/10">
                    <div className="text-primary/25 text-[10px] mb-1 uppercase tracking-wider">{aiName} can:</div>
                    {CORE_DISPLAYS.map(({ key, label }) => {
                      const allowed = (autonomyConfig.allowedActions ?? []).includes(key);
                      return (
                        <div key={key} className="flex items-center justify-between py-0.5">
                          <span className="text-primary/35">{label}</span>
                          <span className={`text-[10px] ${allowed ? "text-[#00ff88]/70" : "text-red-400/40"}`}>{allowed ? "✓" : "✗"}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* RECENT JARVIS ACTIONS — decision transparency feed */}
            {recentActions.length > 0 && (
              <div className="mt-2 border border-primary/10 p-2 bg-background/30 font-mono text-xs">
                <div className="flex items-center gap-1.5 text-primary/25 mb-1.5 uppercase text-[10px] tracking-wider">
                  <Zap className="w-2.5 h-2.5" />
                  <span>Last actions</span>
                </div>
                {recentActions.map((a) => (
                  <div key={a.id} className="mb-0.5">
                    <span className="text-primary/40">{a.label}</span>
                    <span className="text-primary/20 ml-1">— {a.detail}</span>
                  </div>
                ))}
              </div>
            )}

            <button
              onClick={() => {
                if (confirm(`Re-run the ${aiName} setup wizard?`)) {
                  localStorage.removeItem("jarvis.initialized");
                  window.location.reload();
                }
              }}
              className="mt-1 w-full text-left px-2 py-1.5 font-mono text-xs text-primary/20 hover:text-primary/50 transition-colors"
            >
              ↺ Reset setup
            </button>
          </div>
        </aside>

        {/* MAIN */}
        <main className="flex-1 overflow-y-auto p-5 relative">
          <ParticleOverlay />
          <div className="absolute inset-0 pointer-events-none border border-primary/8 m-3 rounded" />
          <div className="absolute inset-0 pointer-events-none" style={{ background: "radial-gradient(ellipse at center, rgba(0,200,255,0.04) 0%, transparent 70%)" }} />
          <div className="relative z-10 h-full">
            {children}
          </div>
        </main>
      </div>

      {/* EVENT LOG PANEL */}
      <EventLogPanel open={eventLogOpen} onClose={() => setEventLogOpen(false)} />

      {/* NOTIFICATION DRAWER */}
      <NotificationDrawer
        open={notifOpen}
        onClose={() => setNotifOpen(false)}
        wsEvents={events}
        onUnreadChange={setUnreadCount}
      />
    </div>
  );
}

function VisualModeOption({
  current, value, label, desc, icon: Icon, onSelect,
}: {
  current: VisualMode;
  value: VisualMode;
  label: string;
  desc: string;
  icon: React.ComponentType<{ className?: string }>;
  onSelect: (m: VisualMode) => void;
}) {
  const active = current === value;
  return (
    <button
      onClick={() => onSelect(value)}
      className={`w-full flex items-center gap-2 px-2 py-1.5 border font-mono text-xs transition-all text-left ${
        active
          ? "border-primary/50 bg-primary/10 text-primary"
          : "border-primary/10 text-primary/40 hover:border-primary/30 hover:text-primary/70"
      }`}
    >
      <Icon className="w-3 h-3 shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="tracking-wider">{label}</div>
        <div className="text-primary/30 text-xs">{desc}</div>
      </div>
      {active && <div className="w-1.5 h-1.5 rounded-full bg-primary shrink-0" />}
    </button>
  );
}

function NavLink({
  href, icon: Icon, label, active,
}: {
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      className={`flex items-center gap-2 px-3 py-2 border font-mono text-xs transition-all nav-link ${
        active
          ? "border-primary/50 bg-primary/10 text-primary nav-active"
          : "border-transparent text-muted-foreground hover:border-primary/30 hover:text-foreground"
      }`}
    >
      <Icon className="w-3.5 h-3.5 shrink-0" />
      <span className="tracking-wider">{label}</span>
    </Link>
  );
}
