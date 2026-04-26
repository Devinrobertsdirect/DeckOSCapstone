import { useState, useEffect, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Bot, Mic2, Palette, Brain, MessageSquare, User2,
  ChevronRight, Check, Volume2, RefreshCw, Sparkles,
} from "lucide-react";
import { HudCorners } from "@/components/HudCorners";

// ── Types ──────────────────────────────────────────────────────────────────

interface AiPersona {
  id:             number;
  aiName:         string;
  gender:         string;
  voice:          string;
  attitude:       string;
  thinkingDepth:  string;
  responseLength: string;
  textColor:      string;
  updatedAt:      string;
}

// ── Constants ──────────────────────────────────────────────────────────────

const PRESET_COLORS = [
  { label: "COBALT",   value: "#3f84f3" },
  { label: "CYAN",     value: "#00d4ff" },
  { label: "EMERALD",  value: "#11d97a" },
  { label: "AMBER",    value: "#ffc820" },
  { label: "CRIMSON",  value: "#f03248" },
  { label: "VIOLET",   value: "#a855f7" },
  { label: "ROSE",     value: "#f472b6" },
  { label: "WHITE",    value: "#e2e8f0" },
];

const GENDERS = [
  { value: "neutral",   label: "Neutral",     desc: "No gender pronoun preference" },
  { value: "male",      label: "Male",        desc: "Uses he/him pronouns" },
  { value: "female",    label: "Female",      desc: "Uses she/her pronouns" },
  { value: "nonbinary", label: "Non-binary",  desc: "Uses they/them pronouns" },
];

const VOICES = [
  { value: "alloy",   label: "ALLOY",   desc: "Neutral, balanced",       sample: "Clear and composed" },
  { value: "echo",    label: "ECHO",    desc: "Male, smooth",             sample: "Resonant and steady" },
  { value: "fable",   label: "FABLE",   desc: "Neutral, storytelling",   sample: "Expressive and warm" },
  { value: "onyx",    label: "ONYX",    desc: "Deep male, authoritative",sample: "Rich and commanding" },
  { value: "nova",    label: "NOVA",    desc: "Female, energetic",        sample: "Bright and confident" },
  { value: "shimmer", label: "SHIMMER", desc: "Soft female, gentle",      sample: "Smooth and calming" },
];

const ATTITUDES = [
  { value: "professional", label: "PROFESSIONAL", desc: "Calm, precise, authoritative",    emoji: "🎯" },
  { value: "casual",       label: "CASUAL",        desc: "Relaxed, friendly companion",     emoji: "😊" },
  { value: "witty",        label: "WITTY",         desc: "Clever, sarcastic, quick",        emoji: "⚡" },
  { value: "serious",      label: "SERIOUS",       desc: "Direct, no-nonsense, focused",    emoji: "🔒" },
  { value: "empathetic",   label: "EMPATHETIC",    desc: "Warm, supportive, in tune",       emoji: "💙" },
  { value: "commanding",   label: "COMMANDING",    desc: "Bold, takes charge, decisive",    emoji: "⚔️" },
  { value: "gentle",       label: "GENTLE",        desc: "Patient, kind, encouraging",      emoji: "🌿" },
  { value: "playful",      label: "PLAYFUL",       desc: "Fun, enthusiastic, light",        emoji: "🎮" },
];

const THINKING_DEPTHS = [
  { value: "quick",    label: "QUICK",    desc: "Fires immediately, no preamble" },
  { value: "standard", label: "STANDARD", desc: "Thinks before answering" },
  { value: "detailed", label: "DETAILED", desc: "Shows step-by-step reasoning" },
];

const RESPONSE_LENGTHS = [
  { value: "brief",         label: "BRIEF",         desc: "1–2 sentences, punchy" },
  { value: "balanced",      label: "BALANCED",      desc: "2–4 sentences, clear" },
  { value: "thorough",      label: "THOROUGH",      desc: "Full explanation with context" },
  { value: "comprehensive", label: "COMPREHENSIVE", desc: "Deep breakdown, all details" },
];

// ── Reusable section header ────────────────────────────────────────────────

function SectionHeader({ icon: Icon, title, sub }: { icon: React.ElementType; title: string; sub?: string }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <Icon className="w-3.5 h-3.5 text-primary/50" />
      <div>
        <div className="text-primary/60 font-mono text-[10px] uppercase tracking-widest">{title}</div>
        {sub && <div className="text-primary/30 font-mono text-[9px]">{sub}</div>}
      </div>
    </div>
  );
}

// ── Preview panel ──────────────────────────────────────────────────────────

function PersonaPreview({ persona }: { persona: Partial<AiPersona> }) {
  const attitude  = ATTITUDES.find(a => a.value === persona.attitude)?.desc ?? "…";
  const depth     = THINKING_DEPTHS.find(d => d.value === persona.thinkingDepth)?.desc ?? "…";
  const length    = RESPONSE_LENGTHS.find(l => l.value === persona.responseLength)?.desc ?? "…";
  const voice     = VOICES.find(v => v.value === persona.voice)?.desc ?? "…";
  const name      = persona.aiName || "JARVIS";
  const color     = persona.textColor || "#00d4ff";

  return (
    <div className="relative border border-primary/20 bg-card/30 p-4 font-mono text-xs">
      <HudCorners />
      <div className="text-primary/30 text-[9px] uppercase tracking-widest mb-2">LIVE PREVIEW</div>
      <div className="space-y-2">
        <div className="flex items-start gap-2">
          <span className="text-primary/30 shrink-0">NAME</span>
          <span style={{ color }} className="font-bold">{name}</span>
        </div>
        <div className="flex items-start gap-2">
          <span className="text-primary/30 shrink-0">VIBE</span>
          <span className="text-primary/60">{attitude}</span>
        </div>
        <div className="flex items-start gap-2">
          <span className="text-primary/30 shrink-0">VOICE</span>
          <span className="text-primary/60">{voice}</span>
        </div>
        <div className="flex items-start gap-2">
          <span className="text-primary/30 shrink-0">THINK</span>
          <span className="text-primary/60">{depth}</span>
        </div>
        <div className="flex items-start gap-2">
          <span className="text-primary/30 shrink-0">LENGTH</span>
          <span className="text-primary/60">{length}</span>
        </div>
        <div className="pt-2 border-t border-primary/10 text-primary/25 italic text-[9px]">
          "Ready when you are, {persona.aiName || "Commander"}."
        </div>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────

export default function AiPersonality() {
  const qc = useQueryClient();

  const { data: saved, isLoading } = useQuery<AiPersona>({
    queryKey: ["ai-persona"],
    queryFn:  () => fetch(`${import.meta.env.BASE_URL}api/ai/persona`).then(r => r.json()),
  });

  const [form, setForm] = useState<Partial<AiPersona>>({
    aiName:         "JARVIS",
    gender:         "neutral",
    voice:          "onyx",
    attitude:       "professional",
    thinkingDepth:  "standard",
    responseLength: "balanced",
    textColor:      "#00d4ff",
  });

  const [saved_ok, setSavedOk] = useState(false);

  useEffect(() => {
    if (saved) setForm(saved);
  }, [saved]);

  const set = useCallback((key: keyof AiPersona, value: string) => {
    setForm(prev => ({ ...prev, [key]: value }));
  }, []);

  const save = useMutation({
    mutationFn: () => fetch(`${import.meta.env.BASE_URL}api/ai/persona`, {
      method:  "PUT",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(form),
    }).then(r => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ai-persona"] });
      setSavedOk(true);
      setTimeout(() => setSavedOk(false), 2500);
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-48 font-mono text-xs text-primary/30">
        <RefreshCw className="w-4 h-4 animate-spin mr-2" /> LOADING PERSONA...
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 pb-10">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 font-mono text-xs text-primary/60 uppercase tracking-widest">
          <Bot className="w-4 h-4 text-primary" />
          <span>AI.PERSONALITY // PERSONA CONFIGURATION</span>
        </div>
        <button
          onClick={() => save.mutate()}
          disabled={save.isPending}
          className="flex items-center gap-2 border border-primary/40 px-4 py-2 font-mono text-xs
                     text-primary hover:bg-primary/10 transition-all disabled:opacity-40"
        >
          {save.isPending ? (
            <RefreshCw className="w-3 h-3 animate-spin" />
          ) : saved_ok ? (
            <Check className="w-3 h-3 text-emerald-400" />
          ) : (
            <Check className="w-3 h-3" />
          )}
          {saved_ok ? "SAVED" : "SAVE CHANGES"}
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* ── Left column: identity ─────────────────────────────────────── */}
        <div className="lg:col-span-2 space-y-6">

          {/* AI Name */}
          <div className="border border-primary/20 bg-card/40 p-5">
            <SectionHeader icon={Bot} title="AI NAME" sub="What should this AI be called?" />
            <input
              type="text"
              value={form.aiName ?? ""}
              onChange={e => set("aiName", e.target.value)}
              maxLength={32}
              placeholder="e.g. JARVIS, SALLY, GUS…"
              className="w-full bg-card/40 border border-primary/20 rounded px-3 py-2 font-mono text-sm
                         text-primary placeholder:text-primary/20 outline-none focus:border-primary/60
                         focus:bg-primary/5 transition-all"
            />
            <div className="mt-1.5 text-primary/25 font-mono text-[9px]">
              This name appears in all conversations and is injected into the AI system prompt.
            </div>
          </div>

          {/* Gender */}
          <div className="border border-primary/20 bg-card/40 p-5">
            <SectionHeader icon={User2} title="GENDER / PRONOUNS" sub="How should the AI refer to itself?" />
            <div className="grid grid-cols-2 gap-2">
              {GENDERS.map(g => {
                const active = form.gender === g.value;
                return (
                  <button
                    key={g.value}
                    onClick={() => set("gender", g.value)}
                    className={`flex items-start gap-3 p-3 border text-left transition-all
                      ${active ? "border-primary bg-primary/10" : "border-primary/15 hover:border-primary/40"}`}
                  >
                    <div className={`w-1.5 h-1.5 rounded-full mt-1 shrink-0 ${active ? "bg-primary" : "bg-primary/20"}`} />
                    <div>
                      <div className={`font-mono text-xs font-bold ${active ? "text-primary" : "text-primary/50"}`}>
                        {g.label}
                      </div>
                      <div className="text-primary/30 font-mono text-[9px] mt-0.5">{g.desc}</div>
                    </div>
                    {active && <ChevronRight className="w-3 h-3 text-primary ml-auto mt-0.5 shrink-0" />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Voice */}
          <div className="border border-primary/20 bg-card/40 p-5">
            <SectionHeader icon={Mic2} title="VOICE" sub="OpenAI TTS voice used for all spoken output" />
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {VOICES.map(v => {
                const active = form.voice === v.value;
                return (
                  <button
                    key={v.value}
                    onClick={() => set("voice", v.value)}
                    className={`flex flex-col items-start p-3 border text-left transition-all
                      ${active ? "border-primary bg-primary/10" : "border-primary/15 hover:border-primary/40"}`}
                  >
                    <div className="flex items-center gap-2 w-full">
                      <Volume2 className={`w-3 h-3 shrink-0 ${active ? "text-primary" : "text-primary/30"}`} />
                      <span className={`font-mono text-xs font-bold flex-1 ${active ? "text-primary" : "text-primary/50"}`}>
                        {v.label}
                      </span>
                      {active && <div className="w-1.5 h-1.5 rounded-full bg-primary" />}
                    </div>
                    <div className="text-primary/30 font-mono text-[9px] mt-1.5">{v.desc}</div>
                    <div className="text-primary/20 font-mono text-[9px] italic">{v.sample}</div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Attitude */}
          <div className="border border-primary/20 bg-card/40 p-5">
            <SectionHeader icon={Sparkles} title="PERSONALITY STYLE" sub="Sets the AI's tone and communication style" />
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {ATTITUDES.map(a => {
                const active = form.attitude === a.value;
                return (
                  <button
                    key={a.value}
                    onClick={() => set("attitude", a.value)}
                    className={`flex flex-col items-start p-3 border text-left transition-all
                      ${active ? "border-primary bg-primary/10" : "border-primary/15 hover:border-primary/40"}`}
                  >
                    <div className="text-base mb-1">{a.emoji}</div>
                    <div className={`font-mono text-[10px] font-bold ${active ? "text-primary" : "text-primary/50"}`}>
                      {a.label}
                    </div>
                    <div className="text-primary/25 font-mono text-[9px] mt-0.5 leading-snug">{a.desc}</div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Thinking depth */}
          <div className="border border-primary/20 bg-card/40 p-5">
            <SectionHeader icon={Brain} title="THINKING DEPTH" sub="Controls how much reasoning the AI shows" />
            <div className="grid grid-cols-3 gap-2">
              {THINKING_DEPTHS.map(d => {
                const active = form.thinkingDepth === d.value;
                return (
                  <button
                    key={d.value}
                    onClick={() => set("thinkingDepth", d.value)}
                    className={`flex flex-col p-3 border text-left transition-all
                      ${active ? "border-primary bg-primary/10" : "border-primary/15 hover:border-primary/40"}`}
                  >
                    <div className={`font-mono text-xs font-bold mb-1 ${active ? "text-primary" : "text-primary/50"}`}>
                      {d.label}
                    </div>
                    <div className="text-primary/30 font-mono text-[9px]">{d.desc}</div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Response length */}
          <div className="border border-primary/20 bg-card/40 p-5">
            <SectionHeader icon={MessageSquare} title="RESPONSE LENGTH" sub="How verbose should the AI be by default?" />
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {RESPONSE_LENGTHS.map(l => {
                const active = form.responseLength === l.value;
                return (
                  <button
                    key={l.value}
                    onClick={() => set("responseLength", l.value)}
                    className={`flex flex-col p-3 border text-left transition-all
                      ${active ? "border-primary bg-primary/10" : "border-primary/15 hover:border-primary/40"}`}
                  >
                    <div className={`font-mono text-[10px] font-bold mb-1 ${active ? "text-primary" : "text-primary/50"}`}>
                      {l.label}
                    </div>
                    <div className="text-primary/30 font-mono text-[9px]">{l.desc}</div>
                  </button>
                );
              })}
            </div>
          </div>

        </div>

        {/* ── Right column: color + preview ─────────────────────────────── */}
        <div className="space-y-6">

          {/* Text color */}
          <div className="border border-primary/20 bg-card/40 p-5">
            <SectionHeader icon={Palette} title="ACCENT COLOR" sub="AI text/UI highlight color" />
            <div className="grid grid-cols-4 gap-2 mb-3">
              {PRESET_COLORS.map(c => {
                const active = form.textColor?.toLowerCase() === c.value.toLowerCase();
                return (
                  <button
                    key={c.value}
                    onClick={() => set("textColor", c.value)}
                    title={c.label}
                    style={{ backgroundColor: c.value }}
                    className={`h-9 rounded transition-all ${active ? "ring-2 ring-white ring-offset-1 ring-offset-card scale-110" : "opacity-70 hover:opacity-100"}`}
                  />
                );
              })}
            </div>
            <div className="flex items-center gap-2">
              <div
                className="w-8 h-8 rounded border border-primary/20 shrink-0"
                style={{ backgroundColor: form.textColor ?? "#00d4ff" }}
              />
              <input
                type="text"
                value={form.textColor ?? "#00d4ff"}
                onChange={e => {
                  const v = e.target.value;
                  if (/^#[0-9a-fA-F]{0,6}$/.test(v)) set("textColor", v);
                }}
                maxLength={7}
                placeholder="#00d4ff"
                className="flex-1 bg-card/40 border border-primary/20 rounded px-2 py-1.5 font-mono text-xs
                           text-primary placeholder:text-primary/20 outline-none focus:border-primary/50 transition-all"
              />
            </div>
            <div className="mt-2 text-primary/20 font-mono text-[9px]">
              This color will be applied to the AI's name and accent elements across the UI on next refresh.
            </div>
          </div>

          {/* Live preview */}
          <PersonaPreview persona={form} />

          {/* Save */}
          <button
            onClick={() => save.mutate()}
            disabled={save.isPending}
            className="w-full flex items-center justify-center gap-2 border border-primary/40 py-3
                       font-mono text-xs text-primary hover:bg-primary/10 transition-all disabled:opacity-40"
          >
            {save.isPending ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            ) : saved_ok ? (
              <Check className="w-3.5 h-3.5 text-emerald-400" />
            ) : (
              <Check className="w-3.5 h-3.5" />
            )}
            <span>{saved_ok ? "PERSONA SAVED" : "SAVE PERSONA"}</span>
          </button>

          {save.isError && (
            <div className="text-red-400 font-mono text-[10px] text-center">Failed to save — check API connection</div>
          )}
        </div>
      </div>
    </div>
  );
}
