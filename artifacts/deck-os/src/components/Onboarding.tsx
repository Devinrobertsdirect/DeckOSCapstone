import { useState, useEffect, useRef, useCallback } from "react";

export interface UserConfig {
  userName: string;
  systemName: string;
  visualMode: "minimal" | "standard" | "cinematic";
  ollamaUrl: string;
}

const STORAGE_KEY = "jarvis.user";
const INIT_KEY    = "jarvis.initialized";

export function getStoredConfig(): UserConfig | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as UserConfig) : null;
  } catch { return null; }
}

export function isInitialized(): boolean {
  try { return localStorage.getItem(INIT_KEY) === "true"; } catch { return false; }
}

// ─────────────────────────────────────────────
// Typewriter hook
// ─────────────────────────────────────────────
function useTypewriter(text: string, speed = 28, startDelay = 0): { out: string; done: boolean } {
  const [out, setOut] = useState("");
  const [done, setDone] = useState(false);

  useEffect(() => {
    setOut("");
    setDone(false);
    let cancel = false;
    const timeout = setTimeout(() => {
      let i = 0;
      const iv = setInterval(() => {
        if (cancel) { clearInterval(iv); return; }
        i++;
        setOut(text.slice(0, i));
        if (i >= text.length) { clearInterval(iv); setDone(true); }
      }, speed);
    }, startDelay);
    return () => { cancel = true; clearTimeout(timeout); };
  }, [text, speed, startDelay]);

  return { out, done };
}

// ─────────────────────────────────────────────
// Boot lines
// ─────────────────────────────────────────────
const BOOT_SEQUENCE = [
  { label: "KERNEL.CORE",          delay: 900  },
  { label: "MEMORY.SUBSYSTEM",     delay: 1200 },
  { label: "EVENT.BUS",            delay: 1500 },
  { label: "COGNITIVE.STACK",      delay: 1800 },
  { label: "INFERENCE.ENGINE",     delay: 2100 },
  { label: "INITIATIVE.SYSTEM",    delay: 2400 },
  { label: "NARRATIVE.LAYER",      delay: 2700 },
  { label: "ALL SYSTEMS NOMINAL.", delay: 3100, complete: true },
];

// ─────────────────────────────────────────────
// Phase types
// ─────────────────────────────────────────────
type Phase = "boot" | "intro" | "name" | "sysname" | "visualmode" | "ollama" | "activation";

// ─────────────────────────────────────────────
// Shared style tokens
// ─────────────────────────────────────────────
const C = {
  cyan:    "#00c8ff",
  green:   "#00ff88",
  yellow:  "#ffcc00",
  dim:     "rgba(0,200,255,0.25)",
  dimmer:  "rgba(0,200,255,0.12)",
};

const gridBg = {
  background: `#050c1a`,
  backgroundImage: `
    linear-gradient(rgba(0,200,255,0.04) 1px, transparent 1px),
    linear-gradient(90deg, rgba(0,200,255,0.04) 1px, transparent 1px)
  `,
  backgroundSize: "40px 40px",
};

// ─────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────
export function Onboarding({ onComplete }: { onComplete: (cfg: UserConfig) => void }) {
  const [phase, setPhase] = useState<Phase>("boot");
  const [transitioning, setTransitioning] = useState(false);
  const [flashActive, setFlashActive] = useState(false);

  // boot state
  const [bootProgress, setBootProgress] = useState(0);
  const [bootLines, setBootLines] = useState<Array<{ label: string; complete?: boolean }>>([]);
  const [showBootTitle, setShowBootTitle] = useState(false);

  // user inputs
  const [userName, setUserName]     = useState("");
  const [systemName, setSystemName] = useState("JARVIS");
  const [ollamaUrl, setOllamaUrl]   = useState("");
  const [visualMode, setVisualMode] = useState<UserConfig["visualMode"]>("standard");

  // activation
  const [activLines, setActivLines] = useState<string[]>([]);
  const [activDone, setActivDone]   = useState(false);
  const [engaging, setEngaging]     = useState(false);

  const nameRef   = useRef<HTMLInputElement>(null);
  const sysRef    = useRef<HTMLInputElement>(null);
  const ollamaRef = useRef<HTMLInputElement>(null);

  // ── flash transition helper ──
  const flash = useCallback((then: () => void, delay = 60) => {
    setTransitioning(true);
    setFlashActive(true);
    setTimeout(() => {
      setFlashActive(false);
      then();
      setTimeout(() => setTransitioning(false), 400);
    }, delay + 180);
  }, []);

  const nextPhase = useCallback((to: Phase) => flash(() => setPhase(to)), [flash]);

  // ── BOOT sequence ──
  useEffect(() => {
    if (phase !== "boot") return;

    setTimeout(() => setShowBootTitle(true), 300);

    // progress bar
    let prog = 0;
    const progIv = setInterval(() => {
      prog += 1.4;
      setBootProgress(Math.min(prog, 100));
      if (prog >= 100) clearInterval(progIv);
    }, 35);

    BOOT_SEQUENCE.forEach(({ label, delay, complete }) => {
      setTimeout(() => setBootLines(prev => [...prev, { label, complete }]), delay);
    });

    // auto-advance
    setTimeout(() => nextPhase("intro"), 4200);

    return () => clearInterval(progIv);
  }, []); // eslint-disable-line

  // ── focus inputs ──
  useEffect(() => {
    if (phase === "name")    setTimeout(() => nameRef.current?.focus(), 600);
    if (phase === "sysname") setTimeout(() => sysRef.current?.focus(), 600);
    if (phase === "ollama")  setTimeout(() => ollamaRef.current?.focus(), 600);
  }, [phase]);

  // ── Activation ceremony lines ──
  useEffect(() => {
    if (phase !== "activation") return;
    setActivLines([]);
    setActivDone(false);

    const lines = [
      `COMMANDER ............. ${(userName || "COMMANDER").toUpperCase()}`,
      `DESIGNATION ........... ${(systemName || "JARVIS").toUpperCase()}`,
      `DISPLAY MODE .......... ${visualMode.toUpperCase()}`,
      `INFERENCE ENGINE ...... ${ollamaUrl ? "LOCAL (OLLAMA)" : "BUILT-IN"}`,
      `COGNITIVE STACK ....... LOADED`,
      `INITIATIVE SYSTEM ..... ARMED`,
      `MEMORY LAYER .......... ACTIVE`,
      `NARRATIVE ENGINE ...... ONLINE`,
      ``,
      `ALL SYSTEMS NOMINAL.`,
      ``,
      `WELCOME, ${(userName || "COMMANDER").toUpperCase()}.`,
    ];

    lines.forEach((line, i) => {
      setTimeout(() => {
        setActivLines(prev => [...prev, line]);
        if (i === lines.length - 1) setTimeout(() => setActivDone(true), 500);
      }, i * 220);
    });
  }, [phase]); // eslint-disable-line

  // ── Enter key handler ──
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key !== "Enter" || transitioning) return;
      if (phase === "intro")      nextPhase("name");
      if (phase === "name" && userName.trim()) nextPhase("sysname");
      if (phase === "sysname")    nextPhase("visualmode");
      if (phase === "visualmode") nextPhase("ollama");
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [phase, userName, transitioning, nextPhase]);

  // ── Final completion ──
  const complete = useCallback(() => {
    if (engaging) return;
    setEngaging(true);
    const cfg: UserConfig = {
      userName:   userName.trim()   || "Commander",
      systemName: systemName.trim() || "JARVIS",
      visualMode,
      ollamaUrl:  ollamaUrl.trim(),
    };
    localStorage.setItem(INIT_KEY,    "true");
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg));
    // set visual mode immediately
    localStorage.setItem("deckos_visual_mode", cfg.visualMode);
    document.documentElement.setAttribute("data-visual-mode", cfg.visualMode);

    setTimeout(() => {
      flash(() => onComplete(cfg), 600);
    }, 800);
  }, [engaging, userName, systemName, visualMode, ollamaUrl, flash, onComplete]);

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center overflow-hidden font-mono"
      style={{ background: "#030912" }}
    >
      {/* SCANLINE during onboarding */}
      <div className="scanline" />

      {/* FLASH OVERLAY */}
      <div
        className="absolute inset-0 pointer-events-none z-50 transition-opacity duration-150"
        style={{ background: "rgba(0,200,255,0.18)", opacity: flashActive ? 1 : 0 }}
      />

      {/* PHASE: BOOT */}
      {phase === "boot" && (
        <BootPhase
          showTitle={showBootTitle}
          progress={bootProgress}
          lines={bootLines}
        />
      )}

      {/* PHASE: INTRO */}
      {phase === "intro" && (
        <IntroPhase
          onContinue={() => nextPhase("name")}
          transitioning={transitioning}
        />
      )}

      {/* PHASE: NAME */}
      {phase === "name" && (
        <InputPhase
          key="name"
          prompt="What shall I call you, Commander?"
          hint="Your name or callsign — this is how I'll address you."
          value={userName}
          onChange={setUserName}
          inputRef={nameRef}
          placeholder="Enter your name"
          onConfirm={() => userName.trim() && nextPhase("sysname")}
          confirmLabel="CONFIRM IDENTITY"
          step={2}
          totalSteps={5}
          transitioning={transitioning}
        />
      )}

      {/* PHASE: SYSTEM NAME */}
      {phase === "sysname" && (
        <InputPhase
          key="sysname"
          prompt="And what shall you call me?"
          hint="Choose a designation for your command system."
          value={systemName}
          onChange={setSystemName}
          inputRef={sysRef}
          placeholder="JARVIS"
          onConfirm={() => nextPhase("visualmode")}
          confirmLabel="SET DESIGNATION"
          step={3}
          totalSteps={5}
          transitioning={transitioning}
        />
      )}

      {/* PHASE: VISUAL MODE */}
      {phase === "visualmode" && (
        <VisualModePhase
          selected={visualMode}
          onSelect={setVisualMode}
          onConfirm={() => nextPhase("ollama")}
          step={4}
          totalSteps={5}
          transitioning={transitioning}
        />
      )}

      {/* PHASE: OLLAMA */}
      {phase === "ollama" && (
        <OllamaPhase
          value={ollamaUrl}
          onChange={setOllamaUrl}
          inputRef={ollamaRef}
          onConfirm={() => nextPhase("activation")}
          onSkip={() => nextPhase("activation")}
          step={5}
          totalSteps={5}
          transitioning={transitioning}
        />
      )}

      {/* PHASE: ACTIVATION */}
      {phase === "activation" && (
        <ActivationPhase
          lines={activLines}
          done={activDone}
          engaging={engaging}
          onEngage={complete}
          transitioning={transitioning}
        />
      )}

      {/* Corner decorations */}
      <Corner pos="tl" />
      <Corner pos="tr" />
      <Corner pos="bl" />
      <Corner pos="br" />
    </div>
  );
}

// ─────────────────────────────────────────────
// Corner brackets
// ─────────────────────────────────────────────
function Corner({ pos }: { pos: "tl" | "tr" | "bl" | "br" }) {
  const size = 24;
  const base: React.CSSProperties = { position: "absolute", width: size, height: size, borderColor: C.dim, borderStyle: "solid" };
  const styles: Record<string, React.CSSProperties> = {
    tl: { ...base, top: 16, left: 16, borderWidth: "1px 0 0 1px" },
    tr: { ...base, top: 16, right: 16, borderWidth: "1px 1px 0 0" },
    bl: { ...base, bottom: 16, left: 16, borderWidth: "0 0 1px 1px" },
    br: { ...base, bottom: 16, right: 16, borderWidth: "0 1px 1px 0" },
  };
  return <div style={styles[pos]} />;
}

// ─────────────────────────────────────────────
// Step indicator
// ─────────────────────────────────────────────
function Steps({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex items-center gap-2 mb-12">
      {Array.from({ length: total }).map((_, i) => (
        <div
          key={i}
          style={{
            width: i + 1 === current ? 24 : 8,
            height: 2,
            background: i + 1 <= current ? C.cyan : C.dimmer,
            transition: "all 0.4s ease",
          }}
        />
      ))}
      <span style={{ color: C.dim, fontSize: 11 }} className="ml-2 tracking-widest">
        {current} / {total}
      </span>
    </div>
  );
}

// ─────────────────────────────────────────────
// Blinking cursor
// ─────────────────────────────────────────────
function Cursor({ visible = true }: { visible?: boolean }) {
  const [on, setOn] = useState(true);
  useEffect(() => {
    if (!visible) return;
    const iv = setInterval(() => setOn(v => !v), 530);
    return () => clearInterval(iv);
  }, [visible]);
  return (
    <span style={{
      display: "inline-block", width: 10, height: "1.1em",
      background: on ? C.cyan : "transparent",
      verticalAlign: "text-bottom",
      marginLeft: 2,
      transition: "background 0.1s",
    }} />
  );
}

// ─────────────────────────────────────────────
// PHASE 0: BOOT
// ─────────────────────────────────────────────
function BootPhase({ showTitle, progress, lines }: {
  showTitle: boolean;
  progress: number;
  lines: Array<{ label: string; complete?: boolean }>;
}) {
  return (
    <div className="w-full max-w-xl px-8 flex flex-col items-start">
      {/* Logo */}
      <div style={{ minHeight: 80, marginBottom: 32 }}>
        {showTitle && (
          <div style={{ animation: "ob-glow-in 0.8s ease forwards" }}>
            <div style={{ fontSize: 42, fontWeight: 700, color: C.cyan, letterSpacing: "0.25em", lineHeight: 1 }}>
              DECK OS
            </div>
            <div style={{ color: C.dim, fontSize: 11, letterSpacing: "0.3em", marginTop: 6 }}>
              SYS.VER.9.4.2 // INITIALIZING
            </div>
          </div>
        )}
      </div>

      {/* Progress bar */}
      <div style={{ width: "100%", height: 2, background: C.dimmer, marginBottom: 28, position: "relative" }}>
        <div style={{
          position: "absolute", left: 0, top: 0, height: "100%",
          width: `${progress}%`,
          background: `linear-gradient(90deg, ${C.cyan}44, ${C.cyan})`,
          boxShadow: `0 0 8px ${C.cyan}`,
          transition: "width 0.08s linear",
        }} />
      </div>

      {/* Boot lines */}
      <div style={{ width: "100%", fontSize: 12, lineHeight: 2 }}>
        {lines.map((line, i) => (
          <div
            key={i}
            style={{
              display: "flex", justifyContent: "space-between", alignItems: "center",
              color: line.complete ? C.green : "rgba(0,200,255,0.55)",
              fontWeight: line.complete ? 700 : 400,
              animation: "ob-slide-in 0.2s ease",
              letterSpacing: "0.08em",
            }}
          >
            <span>&gt;&gt; {line.label}</span>
            {!line.complete && <span style={{ color: C.green }}>&nbsp;[ OK ]</span>}
          </div>
        ))}
        {lines.length > 0 && lines.length < BOOT_SEQUENCE.length + 1 && (
          <div style={{ color: C.dim }}>
            &gt;&gt; <Cursor />
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// PHASE 1: INTRO
// ─────────────────────────────────────────────
const INTRO_TEXT = `DECK OS ONLINE.

I am your adaptive AI command layer.

I manage memory, goals, and context across
every device, channel, and session you use.

This is my first boot on your system.

Before I initialize fully, I need to configure
myself to your exact specifications.`;

function IntroPhase({ onContinue, transitioning }: {
  onContinue: () => void;
  transitioning: boolean;
}) {
  const { out, done } = useTypewriter(INTRO_TEXT, 22, 200);
  const [showBtn, setShowBtn] = useState(false);
  const [btnHover, setBtnHover] = useState(false);

  useEffect(() => {
    if (done) setTimeout(() => setShowBtn(true), 600);
  }, [done]);

  return (
    <div className="w-full max-w-lg px-8 flex flex-col" style={{ ...gridBg, padding: "3rem 2rem", border: `1px solid ${C.dimmer}` }}>
      <pre style={{
        fontFamily: "var(--font-mono)",
        fontSize: 14,
        lineHeight: 1.85,
        color: "rgba(0,200,255,0.75)",
        whiteSpace: "pre-wrap",
        margin: 0,
        minHeight: 200,
      }}>
        {out}{!done && <Cursor />}
      </pre>

      {showBtn && (
        <div style={{ marginTop: 40, animation: "ob-fade-in 0.6s ease" }}>
          <button
            onClick={onContinue}
            disabled={transitioning}
            onMouseEnter={() => setBtnHover(true)}
            onMouseLeave={() => setBtnHover(false)}
            style={{
              background: "transparent",
              border: `1px solid ${btnHover ? C.cyan : C.dim}`,
              color: btnHover ? C.cyan : "rgba(0,200,255,0.55)",
              fontFamily: "var(--font-mono)",
              fontSize: 12,
              letterSpacing: "0.2em",
              padding: "10px 28px",
              cursor: "pointer",
              transition: "all 0.2s ease",
              boxShadow: btnHover ? `0 0 20px ${C.cyan}33` : "none",
            }}
          >
            PRESS ENTER TO BEGIN
          </button>
          <div style={{ color: C.dimmer, fontSize: 11, marginTop: 10, letterSpacing: "0.1em" }}>
            or click above
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// PHASE 2/3: INPUT PHASE
// ─────────────────────────────────────────────
function InputPhase({ prompt, hint, value, onChange, inputRef, placeholder, onConfirm, confirmLabel, step, totalSteps, transitioning }: {
  prompt: string;
  hint: string;
  value: string;
  onChange: (v: string) => void;
  inputRef: React.RefObject<HTMLInputElement | null>;
  placeholder: string;
  onConfirm: () => void;
  confirmLabel: string;
  step: number;
  totalSteps: number;
  transitioning: boolean;
}) {
  const { out, done } = useTypewriter(prompt, 25, 100);
  const [focused, setFocused] = useState(false);
  const [hover, setHover] = useState(false);

  return (
    <div className="w-full max-w-lg px-8 flex flex-col" style={{ animation: "ob-fade-in 0.5s ease" }}>
      <Steps current={step} total={totalSteps} />

      <div style={{ fontSize: 18, color: C.cyan, letterSpacing: "0.05em", lineHeight: 1.5, marginBottom: 32, minHeight: 54 }}>
        {out}{!done && <Cursor />}
      </div>

      <div style={{ position: "relative", marginBottom: 16 }}>
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onKeyDown={e => e.key === "Enter" && onConfirm()}
          style={{
            width: "100%",
            background: "rgba(0,200,255,0.04)",
            border: `1px solid ${focused ? C.cyan : C.dim}`,
            outline: "none",
            color: C.cyan,
            fontFamily: "var(--font-mono)",
            fontSize: 22,
            letterSpacing: "0.1em",
            padding: "14px 16px",
            boxShadow: focused ? `0 0 24px ${C.cyan}22, inset 0 0 12px ${C.cyan}08` : "none",
            transition: "all 0.25s ease",
          }}
        />
      </div>

      <div style={{ color: "rgba(0,200,255,0.3)", fontSize: 11, letterSpacing: "0.1em", marginBottom: 36 }}>
        {hint}
      </div>

      <button
        onClick={onConfirm}
        disabled={transitioning}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        style={{
          alignSelf: "flex-start",
          background: hover ? "rgba(0,200,255,0.12)" : "transparent",
          border: `1px solid ${hover ? C.cyan : C.dim}`,
          color: hover ? C.cyan : "rgba(0,200,255,0.5)",
          fontFamily: "var(--font-mono)",
          fontSize: 11,
          letterSpacing: "0.2em",
          padding: "10px 24px",
          cursor: "pointer",
          transition: "all 0.2s ease",
          boxShadow: hover ? `0 0 20px ${C.cyan}22` : "none",
        }}
      >
        {confirmLabel} →
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────
// PHASE 4: VISUAL MODE
// ─────────────────────────────────────────────
const MODES: Array<{
  id: UserConfig["visualMode"];
  label: string;
  desc: string;
  lines: string[];
  color: string;
}> = [
  {
    id: "minimal",
    label: "MINIMAL",
    desc: "Clean signal, no interference",
    lines: ["No grid overlay", "No glow effects", "Maximum focus", "High contrast"],
    color: "#aaaaaa",
  },
  {
    id: "standard",
    label: "STANDARD",
    desc: "Balanced HUD interface",
    lines: ["Subtle grid", "Controlled glow", "Scanline active", "Default palette"],
    color: C.cyan,
  },
  {
    id: "cinematic",
    label: "CINEMATIC",
    desc: "Full JARVIS experience",
    lines: ["Enhanced grid", "Breathing glow", "Value flicker", "Full effects"],
    color: "#aa88ff",
  },
];

function VisualModePhase({ selected, onSelect, onConfirm, step, totalSteps, transitioning }: {
  selected: UserConfig["visualMode"];
  onSelect: (m: UserConfig["visualMode"]) => void;
  onConfirm: () => void;
  step: number;
  totalSteps: number;
  transitioning: boolean;
}) {
  const { out } = useTypewriter("Select your display configuration.", 25, 100);
  const [hover, setHover] = useState(false);

  return (
    <div className="w-full max-w-2xl px-8 flex flex-col" style={{ animation: "ob-fade-in 0.5s ease" }}>
      <Steps current={step} total={totalSteps} />

      <div style={{ fontSize: 18, color: C.cyan, letterSpacing: "0.05em", marginBottom: 36 }}>
        {out}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, marginBottom: 36 }}>
        {MODES.map(m => {
          const active = selected === m.id;
          return (
            <button
              key={m.id}
              onClick={() => onSelect(m.id)}
              style={{
                background: active ? `${m.color}0a` : "transparent",
                border: `1px solid ${active ? m.color : C.dimmer}`,
                color: active ? m.color : "rgba(0,200,255,0.4)",
                fontFamily: "var(--font-mono)",
                padding: "20px 16px",
                cursor: "pointer",
                textAlign: "left",
                transition: "all 0.25s ease",
                boxShadow: active ? `0 0 24px ${m.color}22, inset 0 0 16px ${m.color}08` : "none",
                position: "relative",
              }}
            >
              {active && (
                <div style={{
                  position: "absolute", top: 8, right: 8,
                  width: 6, height: 6, borderRadius: "50%",
                  background: m.color,
                  boxShadow: `0 0 8px ${m.color}`,
                }} />
              )}
              <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: "0.2em", marginBottom: 8 }}>
                {m.label}
              </div>
              <div style={{ fontSize: 10, color: active ? `${m.color}99` : C.dimmer, marginBottom: 14, letterSpacing: "0.05em" }}>
                {m.desc}
              </div>
              <div style={{ fontSize: 10, lineHeight: 1.9, color: active ? `${m.color}77` : "rgba(0,200,255,0.2)" }}>
                {m.lines.map((l, i) => <div key={i}>&gt; {l}</div>)}
              </div>
            </button>
          );
        })}
      </div>

      <button
        onClick={onConfirm}
        disabled={transitioning}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        style={{
          alignSelf: "flex-start",
          background: hover ? "rgba(0,200,255,0.12)" : "transparent",
          border: `1px solid ${hover ? C.cyan : C.dim}`,
          color: hover ? C.cyan : "rgba(0,200,255,0.5)",
          fontFamily: "var(--font-mono)",
          fontSize: 11,
          letterSpacing: "0.2em",
          padding: "10px 24px",
          cursor: "pointer",
          transition: "all 0.2s ease",
          boxShadow: hover ? `0 0 20px ${C.cyan}22` : "none",
        }}
      >
        CONFIRM MODE →
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────
// PHASE 5: OLLAMA
// ─────────────────────────────────────────────
function OllamaPhase({ value, onChange, inputRef, onConfirm, onSkip, step, totalSteps, transitioning }: {
  value: string;
  onChange: (v: string) => void;
  inputRef: React.RefObject<HTMLInputElement | null>;
  onConfirm: () => void;
  onSkip: () => void;
  step: number;
  totalSteps: number;
  transitioning: boolean;
}) {
  const { out } = useTypewriter("Connect a local AI engine.", 25, 100);
  const [focused, setFocused] = useState(false);
  const [hoverA, setHoverA] = useState(false);
  const [hoverB, setHoverB] = useState(false);

  return (
    <div className="w-full max-w-lg px-8 flex flex-col" style={{ animation: "ob-fade-in 0.5s ease" }}>
      <Steps current={step} total={totalSteps} />

      <div style={{ fontSize: 18, color: C.cyan, letterSpacing: "0.05em", marginBottom: 16 }}>
        {out}
      </div>

      <div style={{ color: "rgba(0,200,255,0.4)", fontSize: 12, lineHeight: 1.8, marginBottom: 32, letterSpacing: "0.04em" }}>
        For full local inference, connect an Ollama instance running on your network.<br />
        Leave this empty to use the built-in reasoning engine — you can configure it later.
      </div>

      <div style={{ fontSize: 11, color: C.dim, letterSpacing: "0.1em", marginBottom: 8 }}>
        OLLAMA ENDPOINT URL
      </div>

      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder="http://localhost:11434"
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onKeyDown={e => e.key === "Enter" && onConfirm()}
        style={{
          width: "100%",
          background: "rgba(0,200,255,0.04)",
          border: `1px solid ${focused ? C.cyan : C.dim}`,
          outline: "none",
          color: C.cyan,
          fontFamily: "var(--font-mono)",
          fontSize: 14,
          letterSpacing: "0.05em",
          padding: "12px 16px",
          marginBottom: 36,
          boxShadow: focused ? `0 0 20px ${C.cyan}18` : "none",
          transition: "all 0.25s ease",
        }}
      />

      <div style={{ display: "flex", gap: 12 }}>
        <button
          onClick={onConfirm}
          disabled={transitioning}
          onMouseEnter={() => setHoverA(true)}
          onMouseLeave={() => setHoverA(false)}
          style={{
            background: hoverA ? "rgba(0,200,255,0.12)" : "transparent",
            border: `1px solid ${hoverA ? C.cyan : C.dim}`,
            color: hoverA ? C.cyan : "rgba(0,200,255,0.5)",
            fontFamily: "var(--font-mono)",
            fontSize: 11,
            letterSpacing: "0.2em",
            padding: "10px 24px",
            cursor: "pointer",
            transition: "all 0.2s ease",
          }}
        >
          {value.trim() ? "CONNECT ENGINE →" : "CONTINUE →"}
        </button>
        <button
          onClick={onSkip}
          disabled={transitioning}
          onMouseEnter={() => setHoverB(true)}
          onMouseLeave={() => setHoverB(false)}
          style={{
            background: "transparent",
            border: `1px solid ${hoverB ? C.dim : "transparent"}`,
            color: "rgba(0,200,255,0.25)",
            fontFamily: "var(--font-mono)",
            fontSize: 11,
            letterSpacing: "0.2em",
            padding: "10px 24px",
            cursor: "pointer",
            transition: "all 0.2s ease",
          }}
        >
          SKIP FOR NOW
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// PHASE 6: ACTIVATION CEREMONY
// ─────────────────────────────────────────────
function ActivationPhase({ lines, done, engaging, onEngage, transitioning }: {
  lines: string[];
  done: boolean;
  engaging: boolean;
  onEngage: () => void;
  transitioning: boolean;
}) {
  const [hover, setHover] = useState(false);

  return (
    <div className="w-full max-w-lg px-8 flex flex-col" style={{ animation: "ob-fade-in 0.4s ease" }}>
      <div style={{ fontSize: 11, color: C.dim, letterSpacing: "0.2em", marginBottom: 28 }}>
        SYSTEM CONFIGURATION COMPLETE
      </div>

      <div style={{ fontSize: 12, lineHeight: 2.2, letterSpacing: "0.06em", marginBottom: 40 }}>
        {lines.map((line, i) => (
          <div
            key={i}
            style={{
              color: line === "" ? "transparent"
                : line.startsWith("WELCOME") ? C.cyan
                : line.startsWith("ALL") ? C.green
                : "rgba(0,200,255,0.55)",
              fontWeight: (line.startsWith("ALL") || line.startsWith("WELCOME")) ? 700 : 400,
              fontSize: line.startsWith("WELCOME") ? 16 : 12,
              letterSpacing: line.startsWith("WELCOME") ? "0.15em" : "0.06em",
              animation: "ob-slide-in 0.3s ease",
              animationFillMode: "backwards",
            }}
          >
            {line}
          </div>
        ))}
        {!done && <Cursor />}
      </div>

      {done && (
        <button
          onClick={onEngage}
          disabled={transitioning || engaging}
          onMouseEnter={() => setHover(true)}
          onMouseLeave={() => setHover(false)}
          style={{
            alignSelf: "flex-start",
            background: engaging ? "rgba(0,200,255,0.25)" : hover ? "rgba(0,200,255,0.16)" : "rgba(0,200,255,0.06)",
            border: `1px solid ${C.cyan}`,
            color: C.cyan,
            fontFamily: "var(--font-mono)",
            fontSize: 13,
            fontWeight: 700,
            letterSpacing: "0.25em",
            padding: "14px 36px",
            cursor: engaging ? "default" : "pointer",
            transition: "all 0.25s ease",
            boxShadow: hover && !engaging
              ? `0 0 40px ${C.cyan}44, 0 0 80px ${C.cyan}18`
              : `0 0 16px ${C.cyan}22`,
            animation: "ob-fade-in 0.8s ease",
          }}
        >
          {engaging ? "INITIALIZING..." : "INITIALIZE COMMAND CENTER"}
        </button>
      )}
    </div>
  );
}
