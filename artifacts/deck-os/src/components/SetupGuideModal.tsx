import { useState, useEffect } from "react";
import { X, ChevronRight, ChevronLeft, Terminal, Cpu, MemoryStick, Zap, CheckCircle2, BookOpen } from "lucide-react";

const STORAGE_KEY = "deckos_setup_guide_seen";

interface Step {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  tag: string;
  content: React.ReactNode;
}

const STEPS: Step[] = [
  {
    icon: Terminal,
    tag: "SYS.INIT",
    title: "Welcome to Deck OS",
    content: (
      <div className="space-y-3 text-primary/70 text-sm leading-relaxed">
        <p>
          You are now interfacing with <span className="text-primary font-bold">Deck OS</span> —
          a fully local AI command center. Your data stays on your machine.
        </p>
        <p>
          This short guide covers the key areas so you can get up and running fast.
          You can dismiss it at any time and reopen it from <span className="text-primary font-mono text-xs">Settings → Help</span>.
        </p>
        <div className="border border-primary/20 bg-primary/5 p-3 font-mono text-xs space-y-1">
          <div className="text-primary/50 uppercase tracking-widest text-[10px] mb-2">SYSTEM STATUS</div>
          <div className="flex justify-between"><span className="text-primary/40">AI BACKEND</span><span className="text-[#ffc820]">CONFIGURE NEXT →</span></div>
          <div className="flex justify-between"><span className="text-primary/40">MEMORY BANK</span><span className="text-[#00ff88]">ONLINE</span></div>
          <div className="flex justify-between"><span className="text-primary/40">PLUGIN STORE</span><span className="text-[#00ff88]">73 SKILLS READY</span></div>
        </div>
      </div>
    ),
  },
  {
    icon: Cpu,
    tag: "AI.ROUTER",
    title: "Connect Your AI",
    content: (
      <div className="space-y-3 text-primary/70 text-sm leading-relaxed">
        <p>Deck OS works with local or cloud AI models. The fastest way to get started is <span className="text-primary font-bold">Ollama</span> (free, runs on your computer).</p>
        <div className="space-y-2 font-mono text-xs">
          <div className="border border-primary/20 bg-black/40 p-3 space-y-2">
            <div className="text-primary/50 uppercase tracking-widest text-[10px] mb-2">OPTION A — LOCAL (RECOMMENDED)</div>
            <div className="text-primary/50">1. Install Ollama from <span className="text-primary">ollama.com</span></div>
            <div className="text-primary/50">2. Open a terminal and run:</div>
            <div className="bg-black/60 border border-primary/10 px-3 py-2 text-primary">ollama pull llama3</div>
            <div className="text-primary/50">3. Deck OS detects it automatically.</div>
          </div>
          <div className="border border-primary/20 bg-black/40 p-3 space-y-1">
            <div className="text-primary/50 uppercase tracking-widest text-[10px] mb-1">OPTION B — OPENAI</div>
            <div className="text-primary/50">Add your key to <span className="text-primary">.env</span> as <span className="text-primary">OPENAI_API_KEY=sk-...</span></div>
          </div>
        </div>
        <p className="text-primary/40 text-xs">Check the AI status indicator in the top header — it turns green when a model is connected.</p>
      </div>
    ),
  },
  {
    icon: BookOpen,
    tag: "NAV.GUIDE",
    title: "Finding Your Way Around",
    content: (
      <div className="space-y-3 text-primary/70 text-sm leading-relaxed">
        <p>The left sidebar is your main navigation. Here is what each section does:</p>
        <div className="font-mono text-xs space-y-1.5">
          {[
            ["SYS.HUD",      "Main dashboard — live system overview"],
            ["AI.ROUTER",    "Chat with your AI, switch models"],
            ["MEMORY.BANK",  "What the AI remembers about you"],
            ["PLUGIN.STORE", "Browse and install 70+ skills"],
            ["ROUTINES",     "Automated tasks on a schedule"],
            ["BRIEFINGS",    "Daily AI-generated summaries"],
            ["CONSOLE",      "Run commands and scripts"],
            ["SETTINGS",     "All configuration in one place"],
          ].map(([label, desc]) => (
            <div key={label} className="flex items-start gap-3 border-b border-primary/8 pb-1.5">
              <span className="text-primary shrink-0 w-28">{label}</span>
              <span className="text-primary/40">{desc}</span>
            </div>
          ))}
        </div>
        <div className="text-primary/40 text-xs font-mono">
          TIP: Press <span className="text-primary border border-primary/30 px-1">E</span> anywhere to toggle the live event log.
        </div>
      </div>
    ),
  },
  {
    icon: MemoryStick,
    tag: "MEMORY.SYS",
    title: "Memory & Personality",
    content: (
      <div className="space-y-3 text-primary/70 text-sm leading-relaxed">
        <p>
          Deck OS gives your AI a persistent memory. Tell it things about yourself and it will
          remember them across sessions — goals, preferences, your name, your schedule.
        </p>
        <div className="border border-primary/20 bg-black/40 p-3 font-mono text-xs space-y-2">
          <div className="text-primary/50 uppercase tracking-widest text-[10px] mb-1">MEMORY LAYERS</div>
          {[
            ["IDENTITY",     "Who you are"],
            ["GOALS",        "What you're working toward"],
            ["PREFERENCES",  "How you like things done"],
            ["CONTEXT",      "Recent topics and history"],
          ].map(([layer, desc]) => (
            <div key={layer} className="flex justify-between items-center">
              <span className="text-primary">{layer}</span>
              <span className="text-primary/40">{desc}</span>
            </div>
          ))}
        </div>
        <p>
          Head to <span className="text-primary font-mono text-xs">AI.PERSONA</span> in the sidebar to
          give your AI a name, choose a voice, and tune its personality.
        </p>
      </div>
    ),
  },
  {
    icon: Zap,
    tag: "PLUGIN.STORE",
    title: "Expand with Skills",
    content: (
      <div className="space-y-3 text-primary/70 text-sm leading-relaxed">
        <p>
          The <span className="text-primary font-bold">Plugin Store</span> gives you access to 70+ skills
          across 11 categories — from homelab tools to security, AI integrations, media control, and automation.
        </p>
        <div className="grid grid-cols-2 gap-1.5 font-mono text-xs">
          {[
            "HOMELAB", "DEVOPS", "AI TOOLS", "SECURITY",
            "PRODUCTIVITY", "AUTOMATION", "MEDIA", "RESEARCH",
            "DATA", "SYSTEM", "COMMS",
          ].map((cat) => (
            <div key={cat} className="border border-primary/15 bg-primary/5 px-2 py-1 text-primary/60 text-[10px] uppercase tracking-wider">
              {cat}
            </div>
          ))}
        </div>
        <p className="text-primary/40 text-xs">
          Navigate to <span className="text-primary font-mono">PLUGIN.STORE</span> in the sidebar to browse and install skills.
        </p>
      </div>
    ),
  },
  {
    icon: CheckCircle2,
    tag: "SYS.READY",
    title: "You're Ready",
    content: (
      <div className="space-y-4 text-primary/70 text-sm leading-relaxed">
        <p>
          Deck OS is fully initialized and ready for your commands.
        </p>
        <div className="border border-[#00ff88]/20 bg-[#00ff88]/5 p-3 font-mono text-xs space-y-1.5">
          <div className="text-[#00ff88]/70 uppercase tracking-widest text-[10px] mb-2">QUICK START CHECKLIST</div>
          {[
            "Start Ollama and pull a model (ollama pull llama3)",
            "Open AI.ROUTER and send your first message",
            "Tell the AI about yourself — it will remember",
            "Browse the Plugin Store for useful skills",
            "Set up a Routine for your daily briefing",
          ].map((item, i) => (
            <div key={i} className="flex items-start gap-2">
              <span className="text-primary/30 shrink-0">{String(i + 1).padStart(2, "0")}.</span>
              <span className="text-primary/60">{item}</span>
            </div>
          ))}
        </div>
        <p className="text-primary/40 text-xs">
          Full documentation is in <span className="text-primary font-mono">SETUP.md</span> in the project folder.
        </p>
      </div>
    ),
  },
];

export function SetupGuideModal() {
  const [visible, setVisible] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (!localStorage.getItem(STORAGE_KEY)) {
      const t = setTimeout(() => setVisible(true), 1200);
      return () => clearTimeout(t);
    }
  }, []);

  function dismiss() {
    localStorage.setItem(STORAGE_KEY, "1");
    setVisible(false);
  }

  if (!visible) return null;

  const current = STEPS[step]!;
  const Icon = current.icon;
  const isLast = step === STEPS.length - 1;
  const isFirst = step === 0;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={dismiss}
      />

      {/* Modal */}
      <div className="relative z-10 w-full max-w-md border border-primary/30 bg-black/95 font-mono shadow-[0_0_60px_rgba(var(--primary-rgb),0.12)] flex flex-col">

        {/* Top bar */}
        <div className="flex items-center gap-2 px-4 py-2.5 border-b border-primary/20 bg-primary/5">
          <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse shrink-0" />
          <span className="text-[10px] uppercase tracking-[0.2em] text-primary/60 flex-1">
            DECK.OS // SETUP.GUIDE // {current.tag}
          </span>
          <button
            onClick={dismiss}
            className="p-1 text-primary/30 hover:text-primary/70 transition-colors"
            title="Dismiss guide"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Step progress bar */}
        <div className="flex h-0.5 bg-primary/10">
          {STEPS.map((_, i) => (
            <div
              key={i}
              className="flex-1 transition-all duration-500"
              style={{
                backgroundColor: i <= step ? "hsl(var(--primary))" : "transparent",
                opacity: i < step ? 0.5 : i === step ? 1 : 0.15,
              }}
            />
          ))}
        </div>

        {/* Content area */}
        <div className="p-5 flex-1">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-8 h-8 border border-primary/30 bg-primary/10 flex items-center justify-center shrink-0">
              <Icon className="w-4 h-4 text-primary" />
            </div>
            <div>
              <div className="text-[10px] text-primary/40 uppercase tracking-widest">{current.tag}</div>
              <div className="text-base font-bold text-primary tracking-wide">{current.title}</div>
            </div>
          </div>

          <div>{current.content}</div>
        </div>

        {/* Footer navigation */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-primary/15 bg-black/40">
          <div className="text-[10px] text-primary/30 uppercase tracking-widest">
            {step + 1} / {STEPS.length}
          </div>
          <div className="flex items-center gap-2">
            {!isFirst && (
              <button
                onClick={() => setStep((s) => s - 1)}
                className="flex items-center gap-1 px-3 py-1.5 border border-primary/20 text-primary/50 hover:text-primary/80 hover:border-primary/40 transition-colors text-[10px] uppercase tracking-widest"
              >
                <ChevronLeft className="w-3 h-3" />
                BACK
              </button>
            )}
            {isLast ? (
              <button
                onClick={dismiss}
                className="flex items-center gap-1 px-4 py-1.5 border border-primary/50 bg-primary/10 text-primary hover:bg-primary/20 transition-colors text-[10px] uppercase tracking-widest font-bold"
              >
                <CheckCircle2 className="w-3 h-3" />
                LAUNCH
              </button>
            ) : (
              <button
                onClick={() => setStep((s) => s + 1)}
                className="flex items-center gap-1 px-3 py-1.5 border border-primary/30 bg-primary/5 text-primary/80 hover:bg-primary/15 hover:text-primary transition-colors text-[10px] uppercase tracking-widest"
              >
                NEXT
                <ChevronRight className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export function reopenSetupGuide() {
  localStorage.removeItem(STORAGE_KEY);
  window.location.reload();
}
