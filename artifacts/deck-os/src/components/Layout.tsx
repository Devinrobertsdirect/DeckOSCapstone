import { useEffect, useState, useMemo } from "react";
import { getStoredConfig, applyColor, getStoredColor, type ColorScheme } from "@/components/Onboarding";
import { Link, useLocation } from "wouter";
import {
  Activity, HardDrive, Cpu as Microchip, Network, Settings,
  TerminalSquare, AlertTriangle, CheckCircle2, Brain,
  Target, RefreshCw, Cpu, ChevronRight, Layers, Eye,
  Minimize2, Maximize2, Film, Radio
} from "lucide-react";
import { useHealthCheck, getHealthCheckQueryKey } from "@workspace/api-client-react";
import { useVisualMode, type VisualMode } from "@/contexts/VisualMode";

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const { mode, setMode } = useVisualMode();
  const cfg = useMemo(() => getStoredConfig(), []);
  const aiName   = cfg?.aiName ?? cfg?.systemName ?? "JARVIS";
  const userName = cfg?.userName ?? null;
  const [activeColor, setActiveColor] = useState<ColorScheme>(getStoredColor());

  useEffect(() => {
    document.documentElement.classList.add("dark");
    applyColor(getStoredColor());
  }, []);

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

  const navSections = [
    {
      label: "SYSTEM",
      items: [
        { href: "/",        icon: Activity,       label: "SYS.HUD"   },
        { href: "/ai",      icon: Microchip,      label: "AI.ROUTER" },
        { href: "/plugins", icon: Settings,        label: "PLUGINS"   },
        { href: "/memory",  icon: HardDrive,       label: "MEMORY.BANK" },
        { href: "/devices", icon: Network,         label: "DEVICES"   },
        { href: "/commands",icon: TerminalSquare,  label: "CONSOLE"   },
      ],
    },
    {
      label: "COGNITION",
      items: [
        { href: "/cognitive",  icon: Brain,     label: "COG.MODEL"  },
        { href: "/goals",      icon: Target,    label: "GOALS"      },
        { href: "/feedback",   icon: RefreshCw, label: "FEEDBACK"   },
        { href: "/autonomous", icon: Cpu,       label: "AUTONOMOUS" },
        { href: "/pulse",      icon: Radio,     label: "COG.PULSE"  },
      ],
    },
  ];

  return (
    <div className="min-h-screen flex flex-col overflow-hidden relative">
      <div className="scanline z-50" />

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
          <div className="flex items-center gap-1.5">
            <span className="text-muted-foreground">STATUS</span>
            {isOnline ? (
              <span className="text-[#00ff88] flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" /> ONLINE
              </span>
            ) : (
              <span className="text-[#ff3333] flex items-center gap-1">
                <AlertTriangle className="w-3.5 h-3.5" /> OFFLINE
              </span>
            )}
          </div>
          {/* Color switcher */}
          <div className="hidden sm:flex items-center gap-1.5">
            {(["blue", "green", "yellow", "red"] as ColorScheme[]).map((c) => {
              const HEX: Record<ColorScheme, string> = { blue: "#00c8ff", green: "#11d97a", yellow: "#ffc820", red: "#f03248" };
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
          <div className="text-primary tabular-nums">
            {new Date().toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" })}
          </div>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* SIDEBAR */}
        <aside className="w-52 border-r border-primary/30 bg-card/50 flex flex-col overflow-y-auto shrink-0 relative z-30">
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
              </div>
            )}

            <div className="mt-2 border border-primary/20 p-2.5 bg-background/50 font-mono text-xs">
              <div className="text-primary/40 mb-1 uppercase text-xs tracking-wider">Override</div>
              {userName && (
                <div className="flex justify-between mb-0.5">
                  <span className="text-primary/40">CMDR:</span>
                  <span className="text-[#00c8ff] uppercase tracking-wider truncate max-w-[80px]">{userName}</span>
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
          <div className="absolute inset-0 pointer-events-none border border-primary/8 m-3 rounded" />
          <div className="absolute inset-0 pointer-events-none" style={{ background: "radial-gradient(ellipse at center, rgba(0,200,255,0.04) 0%, transparent 70%)" }} />
          <div className="relative z-10 h-full">
            {children}
          </div>
        </main>
      </div>
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
