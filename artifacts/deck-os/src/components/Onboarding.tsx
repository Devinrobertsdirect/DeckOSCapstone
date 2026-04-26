import { useState, useEffect, useRef, useCallback } from "react";

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────
export type ColorScheme = "blue" | "green" | "yellow" | "red";
export type VisualMode  = "minimal" | "standard" | "cinematic";

export interface UserConfig {
  color:       ColorScheme;
  aiName:      string;
  systemName:  string; // alias kept for layout compat
  voiceMode:   boolean;
  userName:    string;
  photoDataUrl:  string | null;
  photoComment:  string | null;
  answers:     { q: string; a: string }[];
  visualMode:  VisualMode;
  ollamaUrl:   string;
}

type Phase = "color" | "boot" | "ai_name" | "voice_mode" | "user_name"
           | "photo" | "questions" | "visual_mode" | "activation";

// ─────────────────────────────────────────────
// Storage
// ─────────────────────────────────────────────
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
// Color system
// ─────────────────────────────────────────────
const COLOR_LABEL: Record<ColorScheme, string> = {
  blue:   "COBALT",
  green:  "EMERALD",
  yellow: "AMBER",
  red:    "CRIMSON",
};
const COLOR_HEX: Record<ColorScheme, string> = {
  blue:   "#3f84f3",
  green:  "#11d97a",
  yellow: "#ffc820",
  red:    "#f03248",
};
const COLOR_DESC: Record<ColorScheme, string> = {
  blue:   "deep focus",
  green:  "growth & clarity",
  yellow: "energy & focus",
  red:    "decisive authority",
};

export function applyColor(c: ColorScheme) {
  document.documentElement.setAttribute("data-color", c);
  localStorage.setItem("deckos_color", c);
}
export function getStoredColor(): ColorScheme {
  return (localStorage.getItem("deckos_color") as ColorScheme) ?? "blue";
}

// ─────────────────────────────────────────────
// Typewriter hook
// ─────────────────────────────────────────────
function useTypewriter(text: string, speed = 28, startDelay = 0) {
  const [out, setOut]   = useState("");
  const [done, setDone] = useState(false);
  useEffect(() => {
    setOut(""); setDone(false);
    let cancel = false;
    const t = setTimeout(() => {
      let i = 0;
      const iv = setInterval(() => {
        if (cancel) { clearInterval(iv); return; }
        i++;
        setOut(text.slice(0, i));
        if (i >= text.length) { clearInterval(iv); setDone(true); }
      }, speed);
    }, startDelay);
    return () => { cancel = true; clearTimeout(t); };
  }, [text, speed, startDelay]);
  return { out, done };
}

// ─────────────────────────────────────────────
// API helpers
// ─────────────────────────────────────────────
async function apiTts(text: string): Promise<void> {
  try {
    const res = await fetch("/api/vision/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    if (!res.ok) return;
    const { audio, format } = (await res.json()) as { audio: string; format: string };
    const el = new Audio(`data:audio/${format};base64,${audio}`);
    await new Promise<void>((resolve) => {
      el.onended = () => resolve();
      el.onerror = () => resolve();
      el.play().catch(() => resolve());
    });
  } catch { /* silent fallback */ }
}

async function apiVision(base64: string, mimeType = "image/jpeg"): Promise<string> {
  const res = await fetch("/api/vision/analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ image: base64, mimeType }),
  });
  if (!res.ok) throw new Error("Vision API error");
  const { response } = (await res.json()) as { response: string };
  return response;
}

async function apiStt(blob: Blob): Promise<string> {
  const b64 = await new Promise<string>((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).split(",")[1] ?? "");
    reader.readAsDataURL(blob);
  });
  const res = await fetch("/api/vision/stt", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ audio: b64 }),
  });
  if (!res.ok) return "";
  const { transcript } = (await res.json()) as { transcript: string };
  return transcript ?? "";
}

// ─────────────────────────────────────────────
// Voice recorder hook
// ─────────────────────────────────────────────
function useVoiceRecorder() {
  const mrRef     = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const [recording, setRecording] = useState(false);

  const start = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      mrRef.current  = mr;
      chunksRef.current = [];
      mr.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      mr.start(250);
      setRecording(true);
    } catch { /* permission denied */ }
  }, []);

  const stop = useCallback((): Promise<string> => {
    return new Promise((resolve) => {
      const mr = mrRef.current;
      if (!mr || mr.state === "inactive") { setRecording(false); resolve(""); return; }
      mr.onstop = async () => {
        setRecording(false);
        try {
          const blob = new Blob(chunksRef.current, { type: mr.mimeType });
          const transcript = await apiStt(blob);
          resolve(transcript);
        } catch { resolve(""); }
        mr.stream.getTracks().forEach((t) => t.stop());
      };
      mr.stop();
    });
  }, []);

  return { recording, start, stop };
}

// ─────────────────────────────────────────────
// TTS hook — tracks speaking state
// ─────────────────────────────────────────────
function useTts() {
  const [speaking, setSpeaking] = useState(false);
  const busy = useRef(false);

  const speak = useCallback(async (text: string) => {
    if (busy.current) return;
    busy.current = true;
    setSpeaking(true);
    try { await apiTts(text); }
    finally { busy.current = false; setSpeaking(false); }
  }, []);

  return { speak, speaking };
}

// ─────────────────────────────────────────────
// HUD shared pieces
// ─────────────────────────────────────────────
function HudCorners() {
  return (
    <>
      <span className="absolute top-4 left-4 w-6 h-6 border-t-2 border-l-2 border-primary/40" />
      <span className="absolute top-4 right-4 w-6 h-6 border-t-2 border-r-2 border-primary/40" />
      <span className="absolute bottom-4 left-4 w-6 h-6 border-b-2 border-l-2 border-primary/40" />
      <span className="absolute bottom-4 right-4 w-6 h-6 border-b-2 border-r-2 border-primary/40" />
    </>
  );
}

function Scanline() {
  return <div className="scanline" />;
}

function ObPanel({ children, className = "", speaking = false }: {
  children: React.ReactNode; className?: string; speaking?: boolean;
}) {
  return (
    <div
      className={`relative border bg-background/80 backdrop-blur-sm p-8 font-mono
        bg-[image:linear-gradient(rgba(var(--primary-rgb),0.04)_1px,transparent_1px),linear-gradient(90deg,rgba(var(--primary-rgb),0.04)_1px,transparent_1px)]
        bg-[size:28px_28px] transition-all duration-300 ${className}`}
      style={{
        borderColor: speaking ? "rgba(var(--primary-rgb),0.55)" : "rgba(var(--primary-rgb),0.2)",
        animation: speaking ? "ob-panel-pulse 1.8s ease-in-out infinite" : "none",
      }}
    >
      {children}
    </div>
  );
}

function SpeakingWave() {
  return (
    <span className="inline-flex items-end gap-px h-3.5 ml-1" aria-hidden>
      {[1, 3, 0, 4, 2, 3, 1].map((d, i) => (
        <span
          key={i}
          className="inline-block w-[2px] bg-primary rounded-full"
          style={{ animation: `speaking-bar 0.55s ${d * 0.07}s ease-in-out infinite alternate` }}
        />
      ))}
    </span>
  );
}

function ObInput({
  value, onChange, placeholder, autoFocus = false, onEnter,
}: {
  value: string; onChange: (v: string) => void; placeholder?: string;
  autoFocus?: boolean; onEnter?: () => void;
}) {
  return (
    <input
      autoFocus={autoFocus}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => { if (e.key === "Enter" && onEnter) onEnter(); }}
      placeholder={placeholder}
      className="w-full bg-transparent border-b-2 border-primary/50 focus:border-primary
        text-primary text-2xl font-mono tracking-widest outline-none py-2
        placeholder:text-primary/20 transition-colors duration-300"
    />
  );
}

function ObButton({
  onClick, children, disabled = false, variant = "primary",
}: {
  onClick: () => void; children: React.ReactNode;
  disabled?: boolean; variant?: "primary" | "ghost";
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`font-mono text-sm tracking-widest uppercase px-6 py-3 transition-all duration-300
        disabled:opacity-30 disabled:cursor-not-allowed
        ${variant === "primary"
          ? "border border-primary text-primary hover:bg-primary/10 hover:shadow-[0_0_20px_rgba(var(--primary-rgb),0.3)] active:scale-95"
          : "text-primary/40 hover:text-primary/60 underline underline-offset-4"
        }`}
    >
      {children}
    </button>
  );
}

function MicButton({
  recording, onStart, onStop, transcribing,
}: {
  recording: boolean; onStart: () => void; onStop: () => void; transcribing: boolean;
}) {
  return (
    <button
      onClick={recording ? onStop : onStart}
      disabled={transcribing}
      className={`relative w-16 h-16 rounded-full border-2 flex items-center justify-center
        transition-all duration-300 font-mono text-xs
        ${transcribing
          ? "border-primary/30 text-primary/30 cursor-wait"
          : recording
            ? "border-red-400 text-red-400 animate-pulse shadow-[0_0_24px_rgba(240,50,72,0.5)]"
            : "border-primary/60 text-primary hover:border-primary hover:shadow-[0_0_16px_rgba(var(--primary-rgb),0.4)]"
        }`}
    >
      {transcribing ? (
        <svg className="animate-spin w-5 h-5" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" strokeDasharray="60" strokeDashoffset="15" />
        </svg>
      ) : recording ? (
        <span className="flex items-end gap-[2px] h-5">
          {[2, 4, 1, 3, 5, 2, 4].map((d, i) => (
            <span
              key={i}
              className="inline-block w-[2px] bg-red-400 rounded-full"
              style={{ animation: `rec-wave ${0.3 + (i % 3) * 0.12}s ${d * 0.06}s ease-in-out infinite alternate` }}
            />
          ))}
        </span>
      ) : (
        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
          <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
          <line x1="12" y1="19" x2="12" y2="23" />
          <line x1="8" y1="23" x2="16" y2="23" />
        </svg>
      )}
    </button>
  );
}

// ─────────────────────────────────────────────
// Phase 0: Color Picker
// ─────────────────────────────────────────────
function ColorPickPhase({ onNext }: { onNext: (c: ColorScheme) => void }) {
  const [selected, setSelected] = useState<ColorScheme>("blue");
  const [visible, setVisible]   = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 400);
    return () => clearTimeout(t);
  }, []);

  function pick(c: ColorScheme) {
    setSelected(c);
    applyColor(c);
  }

  return (
    <div className="fixed inset-0 flex flex-col items-center justify-center bg-background z-50">
      <HudCorners />
      <Scanline />
      <div
        className={`flex flex-col items-center gap-12 transition-all duration-700 ${visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}
      >
        <div className="text-center space-y-1">
          <div className="text-primary/30 font-mono text-xs tracking-[0.4em] uppercase">
            DeckOS // First Boot
          </div>
          <div className="text-primary font-mono text-xl tracking-[0.3em] uppercase">
            Choose Your System Color
          </div>
        </div>

        <div className="flex gap-8 items-center">
          {(["blue", "green", "yellow", "red"] as ColorScheme[]).map((c) => (
            <button
              key={c}
              onClick={() => pick(c)}
              className="flex flex-col items-center gap-3 group"
            >
              <div
                className={`w-14 h-14 rounded-full border-2 transition-all duration-300
                  ${selected === c
                    ? "scale-110 border-transparent shadow-[0_0_32px_8px_var(--dot-glow)]"
                    : "border-white/20 opacity-50 hover:opacity-80 hover:scale-105"
                  }`}
                style={{
                  backgroundColor: COLOR_HEX[c],
                  // @ts-ignore
                  "--dot-glow": COLOR_HEX[c] + "80",
                }}
              />
              <div className={`font-mono text-xs tracking-widest transition-all duration-300
                ${selected === c ? "text-primary" : "text-primary/30 group-hover:text-primary/50"}`}>
                {COLOR_LABEL[c]}
              </div>
              {selected === c && (
                <div className="font-mono text-[10px] text-primary/50 tracking-wider text-center max-w-[80px]">
                  {COLOR_DESC[c]}
                </div>
              )}
            </button>
          ))}
        </div>

        <div className="flex flex-col items-center gap-3">
          <ObButton onClick={() => onNext(selected)}>
            Confirm — Begin Setup →
          </ObButton>
          <div className="font-mono text-xs text-primary/20">You can change this at any time</div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// Phase 1: Boot
// ─────────────────────────────────────────────
const BOOT_LINES = [
  { label: "KERNEL.CORE",       delay: 400  },
  { label: "MEMORY.SUBSYSTEM",  delay: 700  },
  { label: "EVENT.BUS",         delay: 1000 },
  { label: "COGNITIVE.STACK",   delay: 1300 },
  { label: "INFERENCE.ENGINE",  delay: 1600 },
  { label: "INITIATIVE.SYSTEM", delay: 1900 },
  { label: "NARRATIVE.LAYER",   delay: 2200 },
  { label: "ALL SYSTEMS NOMINAL.", delay: 2700, special: true },
];

function BootPhase({ aiName, onNext }: { aiName: string; onNext: () => void }) {
  const [lines, setLines] = useState<typeof BOOT_LINES>([]);
  const [progress, setProgress] = useState(0);
  const [done, setDone] = useState(false);

  useEffect(() => {
    BOOT_LINES.forEach((l, i) => {
      setTimeout(() => setLines((prev) => [...prev, l]), l.delay);
      setTimeout(() => setProgress(((i + 1) / BOOT_LINES.length) * 100), l.delay);
    });
    setTimeout(() => { setDone(true); setTimeout(onNext, 700); }, 3400);
  }, [onNext]);

  return (
    <div className="fixed inset-0 flex flex-col items-center justify-center bg-background z-50">
      <HudCorners />
      <Scanline />
      <div className="w-full max-w-xl px-4 space-y-6 animate-[ob-fade-in_0.6s_ease_both]">
        <div className="text-center space-y-1 mb-2">
          <div className="text-primary font-sans text-4xl font-bold tracking-[0.3em] uppercase
            drop-shadow-[0_0_20px_rgba(var(--primary-rgb),0.7)] animate-[ob-glow-in_1s_ease_both]">
            DECK OS
          </div>
          <div className="text-primary/40 font-mono text-xs tracking-widest">{aiName} — FIRST BOOT</div>
        </div>

        <div className="h-1 w-full bg-primary/10 rounded-full overflow-hidden">
          <div
            className="h-full bg-primary transition-all duration-300 shadow-[0_0_8px_rgba(var(--primary-rgb),0.8)]"
            style={{ width: `${progress}%` }}
          />
        </div>

        <ObPanel>
          <div className="space-y-1.5 min-h-[180px]">
            {lines.map((l, i) => (
              <div
                key={i}
                className={`flex items-center justify-between animate-[ob-slide-in_0.25s_ease_both]
                  ${l.special ? "text-primary mt-2 font-bold" : "text-primary/70"} font-mono text-sm`}
              >
                <span className="tracking-wider">&gt;&gt; {l.label}</span>
                {!l.special && (
                  <span className="text-green-400 text-xs tracking-widest">[ OK ]</span>
                )}
              </div>
            ))}
            {!done && (
              <span className="inline-block w-2 h-4 bg-primary animate-pulse ml-1" />
            )}
          </div>
        </ObPanel>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// Phase 2: AI Name
// ─────────────────────────────────────────────
function AiNamePhase({ voiceMode, onNext }: { voiceMode: boolean; onNext: (name: string) => void }) {
  const [name, setName] = useState("JARVIS");
  const prompt = "I am your AI command layer. I manage memory, goals, and context across every device you use.\n\nBefore we go any further — what shall you call me?";
  const { out, done } = useTypewriter(prompt, 22, 200);
  const { speak, speaking } = useTts();

  useEffect(() => {
    if (!voiceMode) return;
    const t = setTimeout(() => speak("I am your AI command layer. Before we go any further — what shall you call me?"), 350);
    return () => clearTimeout(t);
  }, [voiceMode, speak]);

  return (
    <div className="fixed inset-0 flex flex-col items-center justify-center bg-background z-50 p-6">
      <HudCorners />
      <Scanline />
      <div className="w-full max-w-xl space-y-8 animate-[ob-fade-in_0.5s_ease_both]">
        <ObPanel speaking={speaking}>
          <div className="space-y-2">
            <div className="flex items-center gap-2 font-mono text-xs text-primary/30 tracking-widest uppercase">
              SYSTEM {speaking && <SpeakingWave />}
            </div>
            <div className="font-mono text-primary/80 text-sm leading-relaxed whitespace-pre-line min-h-[72px]">
              {out}
              {!done && <span className="inline-block w-2 h-4 bg-primary animate-pulse ml-1 align-middle" />}
            </div>
          </div>
        </ObPanel>

        {done && (
          <div className="space-y-6 animate-[ob-fade-in_0.4s_ease_both]">
            <div className="space-y-2">
              <div className="font-mono text-xs text-primary/30 tracking-widest uppercase">AI Designation</div>
              <ObInput
                value={name}
                onChange={(v) => setName(v.toUpperCase())}
                placeholder="JARVIS"
                autoFocus
                onEnter={() => name.trim() && onNext(name.trim())}
              />
            </div>
            <ObButton onClick={() => name.trim() && onNext(name.trim())} disabled={!name.trim()}>
              Set Designation →
            </ObButton>
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// Phase 3: Voice Mode
// ─────────────────────────────────────────────
function VoiceModePhase({ aiName, onNext }: { aiName: string; onNext: (voice: boolean) => void }) {
  const [visible, setVisible] = useState(false);
  useEffect(() => { setTimeout(() => setVisible(true), 300); }, []);

  async function choose(voice: boolean) {
    if (voice) {
      await apiTts(`Wonderful. I'll speak to you from now on, ${aiName} is ready.`);
    }
    onNext(voice);
  }

  return (
    <div className="fixed inset-0 flex flex-col items-center justify-center bg-background z-50 p-6">
      <HudCorners />
      <Scanline />
      <div className={`w-full max-w-xl space-y-8 transition-all duration-500
        ${visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}>
        <div className="text-center space-y-2">
          <div className="text-primary/40 font-mono text-xs tracking-[0.4em] uppercase">Interaction Protocol</div>
          <div className="text-primary font-mono text-xl tracking-widest">How shall we communicate?</div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          {[
            {
              voice: true,
              icon: (
                <svg className="w-8 h-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                  <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                  <line x1="12" y1="19" x2="12" y2="23" />
                  <line x1="8" y1="23" x2="16" y2="23" />
                </svg>
              ),
              title: "VOICE",
              desc: `Speak to ${aiName}. ${aiName} will speak back to you.`,
              tag: "RECOMMENDED",
            },
            {
              voice: false,
              icon: (
                <svg className="w-8 h-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <rect x="2" y="4" width="20" height="16" rx="2" />
                  <path d="M8 9h8M8 13h4" />
                </svg>
              ),
              title: "TEXT",
              desc: "Type your thoughts. Everything stays silent.",
              tag: null,
            },
          ].map(({ voice, icon, title, desc, tag }) => (
            <button
              key={title}
              onClick={() => choose(voice)}
              className="group relative border border-primary/20 p-6 text-left flex flex-col gap-4
                hover:border-primary/60 hover:bg-primary/5 hover:shadow-[0_0_24px_rgba(var(--primary-rgb),0.15)]
                transition-all duration-300 active:scale-[0.98]"
            >
              {tag && (
                <div className="absolute top-2 right-2 font-mono text-[9px] text-primary/50 tracking-widest">
                  {tag}
                </div>
              )}
              <div className="text-primary/70 group-hover:text-primary transition-colors">{icon}</div>
              <div>
                <div className="font-mono text-sm font-bold tracking-widest text-primary mb-1">{title}</div>
                <div className="font-mono text-xs text-primary/50 leading-relaxed">{desc}</div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// Phase 4: User Name
// ─────────────────────────────────────────────
function UserNamePhase({
  voiceMode, aiName, onNext,
}: { voiceMode: boolean; aiName: string; onNext: (name: string) => void }) {
  const [name, setName]             = useState("");
  const { recording, start, stop }  = useVoiceRecorder();
  const [transcribing, setTranscribing] = useState(false);
  const question = `What shall I call you, Commander?`;
  const { out, done } = useTypewriter(question, 28, 300);
  const { speak, speaking } = useTts();

  useEffect(() => {
    if (!voiceMode) return;
    const t = setTimeout(() => speak(question), 350);
    return () => clearTimeout(t);
  }, [voiceMode, speak, question]);

  async function handleVoice() {
    if (recording) {
      setTranscribing(true);
      const t = await stop();
      setTranscribing(false);
      if (t) setName(t.trim());
    } else {
      await start();
    }
  }

  return (
    <div className="fixed inset-0 flex flex-col items-center justify-center bg-background z-50 p-6">
      <HudCorners />
      <Scanline />
      <div className="w-full max-w-xl space-y-8 animate-[ob-fade-in_0.5s_ease_both]">
        <ObPanel speaking={speaking}>
          <div className="space-y-1">
            <div className="flex items-center gap-2 font-mono text-xs text-primary/30 tracking-widest uppercase">
              {aiName} {speaking && <SpeakingWave />}
            </div>
            <div className="font-mono text-primary/80 text-sm leading-relaxed min-h-[24px]">
              {out}
              {!done && <span className="inline-block w-2 h-4 bg-primary animate-pulse ml-1 align-middle" />}
            </div>
          </div>
        </ObPanel>

        {done && (
          <div className="space-y-6 animate-[ob-fade-in_0.4s_ease_both]">
            <div className="space-y-2">
              <div className="font-mono text-xs text-primary/30 tracking-widest uppercase">Your Name or Callsign</div>
              <div className="flex items-end gap-4">
                <ObInput
                  value={name}
                  onChange={setName}
                  placeholder="Commander"
                  autoFocus={!voiceMode}
                  onEnter={() => name.trim() && onNext(name.trim())}
                />
                {voiceMode && (
                  <MicButton
                    recording={recording}
                    onStart={handleVoice}
                    onStop={handleVoice}
                    transcribing={transcribing}
                  />
                )}
              </div>
            </div>
            <ObButton onClick={() => name.trim() && onNext(name.trim())} disabled={!name.trim()}>
              Confirm →
            </ObButton>
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// Phase 5: Photo
// ─────────────────────────────────────────────
function PhotoPhase({
  voiceMode, aiName, userName, onNext,
}: {
  voiceMode: boolean; aiName: string; userName: string;
  onNext: (photo: string | null, comment: string | null) => void;
}) {
  const [mode, setMode]             = useState<"choose" | "camera" | "preview">("choose");
  const [photoDataUrl, setPhoto]    = useState<string | null>(null);
  const [comment, setComment]       = useState<string | null>(null);
  const [analyzing, setAnalyzing]   = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const videoRef  = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileRef   = useRef<HTMLInputElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const { out, done } = useTypewriter(`Let me see you, ${userName}. Share a photo — I'll keep it between us.`, 24, 300);
  const { speak, speaking } = useTts();

  useEffect(() => {
    if (!voiceMode) return;
    const t = setTimeout(() => speak(`Let me see you, ${userName}. Share a photo and I'll tell you what I see.`), 350);
    return () => clearTimeout(t);
  }, [voiceMode, speak, userName]);

  useEffect(() => () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
  }, []);

  async function startCamera() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" } });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
        videoRef.current.onloadedmetadata = () => setCameraReady(true);
      }
      setMode("camera");
    } catch { alert("Camera not available."); }
  }

  async function capture() {
    const video  = videoRef.current!;
    const canvas = canvasRef.current!;
    canvas.width  = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d")!.drawImage(video, 0, 0);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    await analyzeImage(dataUrl, "image/jpeg");
  }

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = reader.result as string;
      const mime = file.type || "image/jpeg";
      await analyzeImage(dataUrl, mime);
    };
    reader.readAsDataURL(file);
  }

  async function analyzeImage(dataUrl: string, mime: string) {
    setPhoto(dataUrl);
    setMode("preview");
    setAnalyzing(true);
    try {
      const base64 = dataUrl.split(",")[1];
      const result = await apiVision(base64, mime);
      setComment(result);
      if (voiceMode) apiTts(result);
    } catch {
      setComment("I see you. Welcome, Commander.");
    } finally {
      setAnalyzing(false);
    }
  }

  return (
    <div className="fixed inset-0 flex flex-col items-center justify-center bg-background z-50 p-6">
      <HudCorners />
      <Scanline />
      <canvas ref={canvasRef} className="hidden" />
      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />

      <div className="w-full max-w-xl space-y-6 animate-[ob-fade-in_0.5s_ease_both]">
        {mode === "choose" && (
          <>
            <ObPanel speaking={speaking}>
              <div className="space-y-1">
                <div className="flex items-center gap-2 font-mono text-xs text-primary/30 tracking-widest uppercase">
                  {aiName} {speaking && <SpeakingWave />}
                </div>
                <div className="font-mono text-primary/80 text-sm leading-relaxed min-h-[24px]">
                  {out}
                  {!done && <span className="inline-block w-2 h-4 bg-primary animate-pulse ml-1 align-middle" />}
                </div>
              </div>
            </ObPanel>
            {done && (
              <div className="space-y-4 animate-[ob-fade-in_0.4s_ease_both]">
                <div className="grid grid-cols-2 gap-4">
                  <button
                    onClick={startCamera}
                    className="group border border-primary/20 p-5 flex flex-col items-center gap-3
                      hover:border-primary/60 hover:bg-primary/5 transition-all duration-300"
                  >
                    <svg className="w-7 h-7 text-primary/60 group-hover:text-primary transition-colors" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                      <circle cx="12" cy="13" r="4" />
                    </svg>
                    <div className="font-mono text-xs text-primary/60 group-hover:text-primary tracking-widest">CAMERA</div>
                  </button>
                  <button
                    onClick={() => fileRef.current?.click()}
                    className="group border border-primary/20 p-5 flex flex-col items-center gap-3
                      hover:border-primary/60 hover:bg-primary/5 transition-all duration-300"
                  >
                    <svg className="w-7 h-7 text-primary/60 group-hover:text-primary transition-colors" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                      <polyline points="17 8 12 3 7 8" />
                      <line x1="12" y1="3" x2="12" y2="15" />
                    </svg>
                    <div className="font-mono text-xs text-primary/60 group-hover:text-primary tracking-widest">UPLOAD</div>
                  </button>
                </div>
                <div className="text-center">
                  <ObButton variant="ghost" onClick={() => onNext(null, null)}>
                    Skip for now
                  </ObButton>
                </div>
              </div>
            )}
          </>
        )}

        {mode === "camera" && (
          <div className="space-y-4 animate-[ob-fade-in_0.3s_ease_both]">
            <div className="font-mono text-xs text-primary/40 tracking-widest text-center">CAMERA FEED ACTIVE</div>
            <div className="relative border border-primary/30 overflow-hidden">
              <video ref={videoRef} className="w-full" playsInline muted />
              {!cameraReady && (
                <div className="absolute inset-0 flex items-center justify-center bg-background/80">
                  <div className="font-mono text-primary/50 text-xs tracking-widest animate-pulse">INITIALIZING CAMERA...</div>
                </div>
              )}
            </div>
            <div className="flex justify-center gap-4">
              <ObButton onClick={capture} disabled={!cameraReady}>Capture →</ObButton>
              <ObButton variant="ghost" onClick={() => { streamRef.current?.getTracks().forEach((t) => t.stop()); setMode("choose"); }}>
                Cancel
              </ObButton>
            </div>
          </div>
        )}

        {mode === "preview" && (
          <div className="space-y-6 animate-[ob-fade-in_0.4s_ease_both]">
            <div className="flex gap-6 items-start">
              {photoDataUrl && (
                <div className="relative flex-shrink-0">
                  <img
                    src={photoDataUrl}
                    alt="Your photo"
                    className="w-32 h-32 object-cover border border-primary/30"
                  />
                  <div className="absolute inset-0 border border-primary/20 pointer-events-none" />
                </div>
              )}
              <ObPanel className="flex-1">
                {analyzing ? (
                  <div className="flex items-center gap-3 font-mono text-primary/60 text-sm">
                    <svg className="animate-spin w-4 h-4 flex-shrink-0" viewBox="0 0 24 24" fill="none">
                      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" strokeDasharray="60" strokeDashoffset="15" />
                    </svg>
                    ANALYZING...
                  </div>
                ) : (
                  <TypewriterText text={comment ?? ""} aiName={aiName} />
                )}
              </ObPanel>
            </div>
            {!analyzing && (
              <div className="flex gap-4 animate-[ob-fade-in_0.3s_ease_both]">
                <ObButton onClick={() => onNext(photoDataUrl, comment)}>
                  Continue →
                </ObButton>
                <ObButton variant="ghost" onClick={() => { setPhoto(null); setComment(null); setMode("choose"); }}>
                  Retake
                </ObButton>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function TypewriterText({ text, aiName }: { text: string; aiName: string }) {
  const { out, done } = useTypewriter(text, 18, 200);
  return (
    <div className="font-mono text-primary/80 text-sm leading-relaxed min-h-[48px]">
      <span className="text-primary/40">{aiName}: </span>
      {out}
      {!done && <span className="inline-block w-2 h-4 bg-primary animate-pulse ml-1 align-middle" />}
    </div>
  );
}

// ─────────────────────────────────────────────
// Phase 6: Questions
// ─────────────────────────────────────────────
const QUESTIONS = [
  "What are you working on right now? Tell me what has your attention.",
  "How do you prefer to work — do you need structure and plans, or do you flow freely?",
  "What's one thing you'd want me to always remember about you?",
];

function QuestionsPhase({
  voiceMode, aiName, userName, onNext,
}: {
  voiceMode: boolean; aiName: string; userName: string;
  onNext: (answers: { q: string; a: string }[]) => void;
}) {
  const [idx, setIdx]       = useState(0);
  const [answers, setAnswers] = useState<{ q: string; a: string }[]>([]);
  const [current, setCurrent] = useState("");
  const { recording, start, stop } = useVoiceRecorder();
  const [transcribing, setTranscribing] = useState(false);
  const q = QUESTIONS[idx];
  const { out, done } = useTypewriter(q ?? "", 24, 300);
  const { speak, speaking } = useTts();

  useEffect(() => { setCurrent(""); }, [idx]);

  useEffect(() => {
    if (!voiceMode) return;
    const t = setTimeout(() => speak(q ?? ""), 350);
    return () => clearTimeout(t);
  }, [idx, voiceMode, speak, q]);

  async function handleVoice() {
    if (recording) {
      setTranscribing(true);
      const t = await stop();
      setTranscribing(false);
      if (t) setCurrent(t.trim());
    } else {
      await start();
    }
  }

  function advance() {
    if (!current.trim()) return;
    const updated = [...answers, { q: q!, a: current.trim() }];
    setAnswers(updated);
    if (idx + 1 < QUESTIONS.length) {
      setIdx((i) => i + 1);
    } else {
      onNext(updated);
    }
  }

  return (
    <div className="fixed inset-0 flex flex-col items-center justify-center bg-background z-50 p-6">
      <HudCorners />
      <Scanline />
      <div className="w-full max-w-xl space-y-6 animate-[ob-fade-in_0.5s_ease_both]">
        <div className="flex gap-1">
          {QUESTIONS.map((_, i) => (
            <div key={i} className={`flex-1 h-0.5 transition-colors duration-500
              ${i <= idx ? "bg-primary" : "bg-primary/15"}`} />
          ))}
        </div>
        <div className="font-mono text-xs text-primary/30 tracking-widest">
          {userName}, {idx + 1} / {QUESTIONS.length}
        </div>

        <ObPanel speaking={speaking}>
          <div className="space-y-1">
            <div className="flex items-center gap-2 font-mono text-xs text-primary/30 tracking-widest uppercase">
              {aiName} {speaking && <SpeakingWave />}
            </div>
            <div className="font-mono text-primary/80 text-sm leading-relaxed min-h-[48px]">
              {out}
              {!done && <span className="inline-block w-2 h-4 bg-primary animate-pulse ml-1 align-middle" />}
            </div>
          </div>
        </ObPanel>

        {done && (
          <div className="space-y-4 animate-[ob-fade-in_0.4s_ease_both]">
            <div className="flex items-end gap-4">
              <textarea
                value={current}
                onChange={(e) => setCurrent(e.target.value)}
                placeholder="Your answer..."
                rows={3}
                autoFocus={!voiceMode}
                className="flex-1 bg-transparent border border-primary/30 focus:border-primary/70
                  text-primary font-mono text-sm p-3 outline-none resize-none
                  placeholder:text-primary/20 transition-colors duration-300"
              />
              {voiceMode && (
                <MicButton
                  recording={recording}
                  onStart={handleVoice}
                  onStop={handleVoice}
                  transcribing={transcribing}
                />
              )}
            </div>
            <ObButton onClick={advance} disabled={!current.trim()}>
              {idx + 1 < QUESTIONS.length ? "Next →" : "Done →"}
            </ObButton>
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// Phase 7: Visual Mode
// ─────────────────────────────────────────────
const VISUAL_MODES: { id: VisualMode; label: string; desc: string; features: string[] }[] = [
  { id: "minimal",   label: "MINIMAL",   desc: "Clean signal",   features: ["No grid", "No scanline", "Pure interface"] },
  { id: "standard",  label: "STANDARD",  desc: "Balanced",       features: ["Subtle grid", "Light glow", "Recommended"] },
  { id: "cinematic", label: "CINEMATIC", desc: "Full immersion",  features: ["Dense grid", "Scanline", "Ambient glow"] },
];

function VisualModePhase({ onNext }: { onNext: (m: VisualMode) => void }) {
  const [selected, setSelected] = useState<VisualMode>("standard");
  const [visible, setVisible]   = useState(false);
  useEffect(() => { setTimeout(() => setVisible(true), 300); }, []);

  return (
    <div className="fixed inset-0 flex flex-col items-center justify-center bg-background z-50 p-6">
      <HudCorners />
      <Scanline />
      <div className={`w-full max-w-xl space-y-8 transition-all duration-500
        ${visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}>
        <div className="text-center space-y-2">
          <div className="text-primary/40 font-mono text-xs tracking-[0.4em] uppercase">Display Protocol</div>
          <div className="text-primary font-mono text-xl tracking-widest">Choose your visual mode</div>
        </div>
        <div className="grid grid-cols-3 gap-3">
          {VISUAL_MODES.map((m) => (
            <button
              key={m.id}
              onClick={() => setSelected(m.id)}
              className={`relative border p-4 text-left flex flex-col gap-3 transition-all duration-300
                ${selected === m.id
                  ? "border-primary shadow-[0_0_20px_rgba(var(--primary-rgb),0.2)] bg-primary/5"
                  : "border-primary/20 hover:border-primary/40"
                }`}
            >
              {selected === m.id && (
                <div className="absolute top-2 right-2 w-2 h-2 rounded-full bg-primary shadow-[0_0_6px_rgba(var(--primary-rgb),0.8)]" />
              )}
              <div className="font-mono text-xs font-bold tracking-widest text-primary">{m.label}</div>
              <div className="font-mono text-[10px] text-primary/40">{m.desc}</div>
              <div className="space-y-1">
                {m.features.map((f) => (
                  <div key={f} className="font-mono text-[10px] text-primary/50 flex items-center gap-1">
                    <span className="text-primary/30">–</span> {f}
                  </div>
                ))}
              </div>
            </button>
          ))}
        </div>
        <ObButton onClick={() => onNext(selected)}>Confirm →</ObButton>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// Phase 8: Activation ceremony
// ─────────────────────────────────────────────
function ActivationPhase({
  config, onComplete,
}: { config: Partial<AccumulatedConfig>; onComplete: () => void }) {
  const [lines, setLines]     = useState<string[]>([]);
  const [ready, setReady]     = useState(false);
  const [activating, setAct]  = useState(false);

  const ceremony = [
    `COMMANDER .............. ${config.userName?.toUpperCase()}`,
    `AI DESIGNATION ......... ${config.aiName?.toUpperCase()}`,
    `SYSTEM COLOR ........... ${COLOR_LABEL[config.color ?? "blue"]}`,
    `INTERACTION MODE ....... ${config.voiceMode ? "VOICE" : "TEXT"}`,
    `DISPLAY MODE ........... ${config.visualMode?.toUpperCase()}`,
    `COGNITIVE STACK ........ ACTIVE`,
    `INITIATIVE SYSTEM ...... ACTIVE`,
    `NARRATIVE ENGINE ....... ACTIVE`,
    config.photoComment ? `VISUAL PROFILE ......... CAPTURED` : null,
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    `ALL SYSTEMS NOMINAL.`,
    `WELCOME, ${config.userName?.toUpperCase()}.`,
  ].filter(Boolean) as string[];

  useEffect(() => {
    ceremony.forEach((l, i) => {
      setTimeout(() => setLines((prev) => [...prev, l]), i * 200);
    });
    setTimeout(() => setReady(true), ceremony.length * 200 + 400);
    if (config.voiceMode) {
      setTimeout(() => {
        apiTts(`Welcome, ${config.userName}. I am ${config.aiName}, and I am ready. Let's build something remarkable together.`);
      }, ceremony.length * 200);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function initialize() {
    setAct(true);
    const cfg: UserConfig = {
      color:        config.color       ?? "blue",
      aiName:       config.aiName      ?? "JARVIS",
      systemName:   config.aiName      ?? "JARVIS",
      voiceMode:    config.voiceMode   ?? false,
      userName:     config.userName    ?? "Commander",
      photoDataUrl: config.photoDataUrl ?? null,
      photoComment: config.photoComment ?? null,
      answers:      config.answers     ?? [],
      visualMode:   config.visualMode  ?? "standard",
      ollamaUrl:    "",
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg));
    localStorage.setItem(INIT_KEY, "true");
    localStorage.setItem("deckos_visual_mode", cfg.visualMode);
    document.documentElement.setAttribute("data-visual-mode", cfg.visualMode);
    setTimeout(onComplete, 800);
  }

  return (
    <div className="fixed inset-0 flex flex-col items-center justify-center bg-background z-50 p-6">
      <HudCorners />
      <Scanline />
      <div className="w-full max-w-xl space-y-6 animate-[ob-fade-in_0.5s_ease_both]">
        <div className="text-center">
          <div className="text-primary font-mono text-xs tracking-[0.4em] uppercase mb-1">System Activation</div>
        </div>
        <ObPanel>
          <div className="font-mono text-xs leading-relaxed space-y-1 min-h-[180px]">
            {lines.map((l, i) => (
              <div
                key={i}
                className={`animate-[ob-slide-in_0.2s_ease_both] transition-colors
                  ${l.startsWith("WELCOME") ? "text-primary font-bold text-sm mt-2" :
                    l.startsWith("━") ? "text-primary/20 my-1" :
                    l.startsWith("ALL") ? "text-primary mt-1" : "text-primary/60"
                  }`}
              >
                {l}
              </div>
            ))}
            {!ready && lines.length > 0 && (
              <span className="inline-block w-2 h-3 bg-primary animate-pulse" />
            )}
          </div>
        </ObPanel>
        {ready && (
          <div className="flex flex-col items-center gap-3 animate-[ob-fade-in_0.5s_ease_both]">
            <button
              onClick={initialize}
              disabled={activating}
              className="border border-primary text-primary font-mono text-sm tracking-widest
                uppercase px-8 py-4 hover:bg-primary/10 transition-all duration-300
                disabled:opacity-50 animate-[ob-btn-pulse_2s_ease-in-out_infinite]
                shadow-[0_0_24px_rgba(var(--primary-rgb),0.2)] hover:shadow-[0_0_40px_rgba(var(--primary-rgb),0.4)]"
            >
              {activating ? "INITIALIZING..." : "INITIALIZE COMMAND CENTER"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// Accumulated config type
// ─────────────────────────────────────────────
interface AccumulatedConfig {
  color:        ColorScheme;
  aiName:       string;
  voiceMode:    boolean;
  userName:     string;
  photoDataUrl: string | null;
  photoComment: string | null;
  answers:      { q: string; a: string }[];
  visualMode:   VisualMode;
}

// ─────────────────────────────────────────────
// Main Onboarding orchestrator
// ─────────────────────────────────────────────
export function Onboarding({ onComplete }: { onComplete: () => void }) {
  const [phase, setPhase]   = useState<Phase>("color");
  const [flashing, setFlash] = useState(false);
  const [cfg, setCfg]       = useState<Partial<AccumulatedConfig>>({
    color: getStoredColor(),
    aiName: "JARVIS",
    voiceMode: false,
    userName: "",
    photoDataUrl: null,
    photoComment: null,
    answers: [],
    visualMode: "standard",
  });

  function advance(next: Phase, patch?: Partial<AccumulatedConfig>) {
    setFlash(true);
    if (patch) setCfg((prev) => ({ ...prev, ...patch }));
    setTimeout(() => { setPhase(next); setFlash(false); }, 350);
  }

  const overlay = (
    <div
      className={`fixed inset-0 bg-background z-[200] pointer-events-none transition-opacity duration-300
        ${flashing ? "opacity-100" : "opacity-0"}`}
    />
  );

  return (
    <>
      {overlay}
      {phase === "color" && (
        <ColorPickPhase onNext={(c) => { applyColor(c); advance("boot", { color: c }); }} />
      )}
      {phase === "boot" && (
        <BootPhase aiName={cfg.aiName ?? "JARVIS"} onNext={() => advance("ai_name")} />
      )}
      {phase === "ai_name" && (
        <AiNamePhase voiceMode={cfg.voiceMode ?? false} onNext={(n) => advance("voice_mode", { aiName: n })} />
      )}
      {phase === "voice_mode" && (
        <VoiceModePhase aiName={cfg.aiName ?? "JARVIS"} onNext={(v) => advance("user_name", { voiceMode: v })} />
      )}
      {phase === "user_name" && (
        <UserNamePhase
          voiceMode={cfg.voiceMode ?? false}
          aiName={cfg.aiName ?? "JARVIS"}
          onNext={(n) => advance("photo", { userName: n })}
        />
      )}
      {phase === "photo" && (
        <PhotoPhase
          voiceMode={cfg.voiceMode ?? false}
          aiName={cfg.aiName ?? "JARVIS"}
          userName={cfg.userName ?? "Commander"}
          onNext={(p, c) => advance("questions", { photoDataUrl: p, photoComment: c })}
        />
      )}
      {phase === "questions" && (
        <QuestionsPhase
          voiceMode={cfg.voiceMode ?? false}
          aiName={cfg.aiName ?? "JARVIS"}
          userName={cfg.userName ?? "Commander"}
          onNext={(a) => advance("visual_mode", { answers: a })}
        />
      )}
      {phase === "visual_mode" && (
        <VisualModePhase onNext={(m) => advance("activation", { visualMode: m })} />
      )}
      {phase === "activation" && (
        <ActivationPhase config={cfg} onComplete={onComplete} />
      )}
    </>
  );
}
