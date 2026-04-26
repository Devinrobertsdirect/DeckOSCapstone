import { useEffect } from "react";
import { Link, useLocation } from "wouter";
import {
  Activity, HardDrive, Cpu as Microchip, Network, Settings,
  TerminalSquare, AlertTriangle, CheckCircle2, Brain,
  Target, RefreshCw, Cpu, ChevronRight
} from "lucide-react";
import { useHealthCheck, getHealthCheckQueryKey } from "@workspace/api-client-react";

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();

  useEffect(() => {
    document.documentElement.classList.add("dark");
  }, []);

  const { data: health } = useHealthCheck({
    query: {
      queryKey: getHealthCheckQueryKey(),
      refetchInterval: 10000,
    }
  });

  const isOnline = health?.status === "ok" || health?.status === "online" || !!health;

  const navSections = [
    {
      label: "SYSTEM",
      items: [
        { href: "/", icon: Activity, label: "SYS.HUD" },
        { href: "/ai", icon: Microchip, label: "AI.ROUTER" },
        { href: "/plugins", icon: Settings, label: "PLUGINS" },
        { href: "/memory", icon: HardDrive, label: "MEMORY.BANK" },
        { href: "/devices", icon: Network, label: "DEVICES" },
        { href: "/commands", icon: TerminalSquare, label: "CONSOLE" },
      ],
    },
    {
      label: "COGNITION",
      items: [
        { href: "/cognitive", icon: Brain, label: "COG.MODEL" },
        { href: "/goals", icon: Target, label: "GOALS" },
        { href: "/feedback", icon: RefreshCw, label: "FEEDBACK" },
        { href: "/autonomous", icon: Cpu, label: "AUTONOMOUS" },
      ],
    },
  ];

  return (
    <div className="min-h-screen flex flex-col overflow-hidden relative">
      <div className="scanline z-50"></div>

      <header className="h-16 border-b border-primary/30 flex items-center px-6 justify-between bg-card/80 backdrop-blur">
        <div className="flex items-center gap-4">
          <div className="w-8 h-8 rounded-full border-2 border-primary flex items-center justify-center pulse-glow">
            <Activity className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-primary tracking-widest uppercase m-0 leading-none">Deck OS</h1>
            <p className="text-xs text-primary/70 font-mono">SYS.VER.9.4.2 // JARVIS</p>
          </div>
        </div>
        <div className="flex items-center gap-6 font-mono text-sm">
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">STATUS</span>
            {isOnline ? (
              <span className="text-[#00ff00] flex items-center gap-1"><CheckCircle2 className="w-4 h-4" /> ONLINE</span>
            ) : (
              <span className="text-[#ff0000] flex items-center gap-1"><AlertTriangle className="w-4 h-4" /> OFFLINE</span>
            )}
          </div>
          <div className="text-primary">
            {new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit', fractionalSecondDigits: 3 })}
          </div>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <aside className="w-56 border-r border-primary/30 bg-card/50 flex flex-col p-3 gap-1 overflow-y-auto">
          {navSections.map((section) => (
            <div key={section.label}>
              <div className="font-mono text-xs text-primary/30 uppercase tracking-widest px-2 py-1.5 flex items-center gap-1">
                <ChevronRight className="w-3 h-3" />{section.label}
              </div>
              {section.items.map(({ href, icon, label }) => (
                <NavLink key={href} href={href} icon={icon} label={label} active={location === href} />
              ))}
            </div>
          ))}

          <div className="mt-auto border border-primary/30 p-3 bg-background/50 rounded font-mono text-xs">
            <div className="text-primary mb-1 font-bold uppercase text-xs">Override</div>
            <div className="text-muted-foreground text-xs">Level: <span className="text-[#ffcc00]">ALPHA</span></div>
            <div className="text-muted-foreground text-xs">Protocol: <span className="text-primary">SECURE</span></div>
          </div>
        </aside>

        <main className="flex-1 overflow-y-auto p-6 relative">
          <div className="absolute inset-0 pointer-events-none border-[1px] border-primary/10 m-4 rounded" />
          <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-primary/5 via-transparent to-transparent" />
          <div className="relative z-10 h-full">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}

function NavLink({ href, icon: Icon, label, active }: { href: string; icon: React.ComponentType<{ className?: string }>; label: string; active: boolean }) {
  return (
    <Link href={href} className={`flex items-center gap-2 px-3 py-2 rounded border font-mono text-xs transition-all ${
      active
        ? "border-primary bg-primary/10 text-primary shadow-[0_0_10px_rgba(0,200,255,0.2)]"
        : "border-transparent text-muted-foreground hover:border-primary/50 hover:text-foreground"
    }`}>
      <Icon className="w-4 h-4" />
      <span className="tracking-wider">{label}</span>
    </Link>
  );
}
