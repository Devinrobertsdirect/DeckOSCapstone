import { useEffect } from "react";
import { Link, useLocation } from "wouter";
import { Activity, Cpu, HardDrive, Cpu as Microchip, Network, Settings, TerminalSquare, AlertTriangle, CheckCircle2 } from "lucide-react";
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

  return (
    <div className="min-h-screen flex flex-col overflow-hidden relative">
      <div className="scanline z-50"></div>
      
      {/* Header */}
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
        {/* Sidebar */}
        <aside className="w-64 border-r border-primary/30 bg-card/50 flex flex-col p-4 gap-2">
          <NavLink href="/" icon={Activity} label="SYS.HUD" active={location === "/"} />
          <NavLink href="/ai" icon={Microchip} label="AI.ROUTER" active={location === "/ai"} />
          <NavLink href="/plugins" icon={Settings} label="PLUGINS" active={location === "/plugins"} />
          <NavLink href="/memory" icon={HardDrive} label="MEMORY.BANK" active={location === "/memory"} />
          <NavLink href="/devices" icon={Network} label="DEVICES" active={location === "/devices"} />
          <NavLink href="/commands" icon={TerminalSquare} label="CONSOLE" active={location === "/commands"} />
          
          <div className="mt-auto border border-primary/30 p-4 bg-background/50 rounded font-mono text-xs">
            <div className="text-primary mb-2 font-bold uppercase">System Override</div>
            <div className="text-muted-foreground">Access Level: <span className="text-[#ffcc00]">ALPHA</span></div>
            <div className="text-muted-foreground">Protocol: <span className="text-primary">SECURE</span></div>
          </div>
        </aside>

        {/* Main Content */}
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

function NavLink({ href, icon: Icon, label, active }: { href: string, icon: any, label: string, active: boolean }) {
  return (
    <Link href={href} className={`flex items-center gap-3 px-4 py-3 rounded border font-mono transition-all ${
      active 
        ? "border-primary bg-primary/10 text-primary shadow-[0_0_10px_rgba(0,200,255,0.2)]" 
        : "border-transparent text-muted-foreground hover:border-primary/50 hover:text-foreground"
    }`}>
      <Icon className="w-5 h-5" />
      <span className="tracking-wider">{label}</span>
    </Link>
  );
}
