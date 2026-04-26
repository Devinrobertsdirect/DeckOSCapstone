import { useState, useEffect } from "react";
import {
  Settings as SettingsIcon, Wifi, WifiOff, Key, Cpu, CheckCircle2,
  XCircle, Loader2, Eye, EyeOff, Save, RotateCcw, AlertTriangle, Zap,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type Tab = "connection" | "apikeys" | "models";

type ConfigState = {
  OLLAMA_HOST:       string;
  REASONING_MODEL:   string;
  FAST_MODEL:        string;
  OPENAI_API_KEY:    string;
  ANTHROPIC_API_KEY: string;
};

type TestResult = { ok: boolean; models?: string[]; error?: string } | null;

const DEFAULTS: ConfigState = {
  OLLAMA_HOST:       "http://localhost:11434",
  REASONING_MODEL:   "gemma3:9b",
  FAST_MODEL:        "phi3",
  OPENAI_API_KEY:    "",
  ANTHROPIC_API_KEY: "",
};

function Badge({ ok }: { ok: boolean }) {
  return ok
    ? <span className="flex items-center gap-1 text-[#11d97a] font-mono text-xs"><CheckCircle2 className="w-3 h-3" />CONNECTED</span>
    : <span className="flex items-center gap-1 text-[#f03248] font-mono text-xs"><XCircle className="w-3 h-3" />OFFLINE</span>;
}

export default function Settings() {
  const [tab, setTab]       = useState<Tab>("connection");
  const [cfg, setCfg]       = useState<ConfigState>(DEFAULTS);
  const [saved, setSaved]   = useState<Partial<ConfigState>>({});
  const [dirty, setDirty]   = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveOk, setSaveOk] = useState(false);

  const [testing, setTesting]   = useState(false);
  const [testResult, setTestResult] = useState<TestResult>(null);

  const [showOai, setShowOai]   = useState(false);
  const [showAnt, setShowAnt]   = useState(false);

  useEffect(() => {
    fetch("/api/config")
      .then((r) => r.json())
      .then((data: { config: Record<string, string> }) => {
        const c = data.config ?? {};
        setCfg({
          OLLAMA_HOST:       c["OLLAMA_HOST"]       ?? DEFAULTS.OLLAMA_HOST,
          REASONING_MODEL:   c["REASONING_MODEL"]   ?? DEFAULTS.REASONING_MODEL,
          FAST_MODEL:        c["FAST_MODEL"]         ?? DEFAULTS.FAST_MODEL,
          OPENAI_API_KEY:    c["OPENAI_API_KEY"]    ?? "",
          ANTHROPIC_API_KEY: c["ANTHROPIC_API_KEY"] ?? "",
        });
        setSaved(c as Partial<ConfigState>);
      })
      .catch(() => {});
  }, []);

  function change<K extends keyof ConfigState>(key: K, value: ConfigState[K]) {
    setCfg((prev) => ({ ...prev, [key]: value }));
    setDirty(true);
    setSaveOk(false);
  }

  async function handleSave() {
    setSaving(true);
    try {
      const body: Record<string, string> = {};
      // Only send non-empty values; skip masked placeholders
      for (const [k, v] of Object.entries(cfg)) {
        if (v && !v.includes("••••")) body[k] = v;
      }
      await fetch("/api/config", {
        method:  "PUT",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(body),
      });
      setDirty(false);
      setSaveOk(true);
      setSaved(body as Partial<ConfigState>);
      setTimeout(() => setSaveOk(false), 3000);
    } finally {
      setSaving(false);
    }
  }

  async function testConnection() {
    setTesting(true);
    setTestResult(null);
    try {
      const r = await fetch("/api/config/test-connection", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ url: cfg.OLLAMA_HOST }),
      });
      const data = await r.json() as TestResult;
      setTestResult(data);
    } catch {
      setTestResult({ ok: false, error: "Network error — is the API server running?" });
    } finally {
      setTesting(false);
    }
  }

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: "connection", label: "CONNECTION",  icon: <Wifi className="w-3 h-3" /> },
    { id: "apikeys",    label: "API KEYS",     icon: <Key className="w-3 h-3" /> },
    { id: "models",     label: "MODELS",       icon: <Cpu className="w-3 h-3" /> },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-2 font-mono text-xs text-primary/60 uppercase tracking-widest">
        <SettingsIcon className="w-4 h-4 text-primary" />
        <span>SYSTEM.SETTINGS // CONFIGURATION &amp; CONNECTIONS // DECK OS</span>
      </div>

      {/* Tab bar */}
      <div className="flex items-center gap-1 font-mono text-xs border-b border-primary/20 pb-0">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 px-4 py-2 border-b-2 transition-all -mb-px ${
              tab === t.id
                ? "border-primary text-primary"
                : "border-transparent text-primary/40 hover:text-primary/70"
            }`}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-2 pb-2">
          {dirty && (
            <span className="text-[#ffc820] flex items-center gap-1 text-xs font-mono">
              <AlertTriangle className="w-3 h-3" /> UNSAVED CHANGES
            </span>
          )}
          {saveOk && (
            <span className="text-[#11d97a] flex items-center gap-1 text-xs font-mono">
              <CheckCircle2 className="w-3 h-3" /> SAVED
            </span>
          )}
          <button
            onClick={handleSave}
            disabled={saving || !dirty}
            className="flex items-center gap-1.5 px-4 py-1.5 border border-primary/40 text-primary font-mono text-xs hover:bg-primary/10 transition-all disabled:opacity-40"
          >
            {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
            SAVE
          </button>
        </div>
      </div>

      {/* CONNECTION tab */}
      {tab === "connection" && (
        <div className="grid gap-6 max-w-2xl">
          <Card className="bg-card/40 border-primary/20 rounded-none">
            <CardHeader className="border-b border-primary/20 p-4">
              <CardTitle className="font-mono text-xs text-primary flex items-center gap-2">
                <Wifi className="w-3.5 h-3.5" />
                OLLAMA.CONNECTION
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 space-y-4">
              <p className="font-mono text-xs text-primary/50 leading-relaxed">
                Ollama runs locally on your machine and powers JARVIS's brain. Enter the address
                where Ollama is listening. The default works if Ollama is on the same machine as the server.
              </p>

              <div className="space-y-2">
                <label className="font-mono text-xs text-primary/60 uppercase">Ollama Host URL</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={cfg.OLLAMA_HOST}
                    onChange={(e) => change("OLLAMA_HOST", e.target.value)}
                    placeholder="http://localhost:11434"
                    className="flex-1 bg-background border border-primary/30 px-3 py-2 font-mono text-xs text-primary focus:border-primary focus:outline-none"
                  />
                  <button
                    onClick={testConnection}
                    disabled={testing}
                    className="px-4 py-2 border border-primary/40 font-mono text-xs text-primary hover:bg-primary/10 transition-all disabled:opacity-50 flex items-center gap-1.5"
                  >
                    {testing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Zap className="w-3 h-3" />}
                    TEST
                  </button>
                </div>
              </div>

              {testResult && (
                <div className={`p-3 border font-mono text-xs space-y-1 ${testResult.ok ? "border-[#11d97a]/30 bg-[#11d97a]/5" : "border-[#f03248]/30 bg-[#f03248]/5"}`}>
                  <Badge ok={testResult.ok} />
                  {testResult.ok && testResult.models && testResult.models.length > 0 && (
                    <div className="text-primary/50 pt-1">
                      <span className="text-primary/30">AVAILABLE MODELS: </span>
                      {testResult.models.join(", ")}
                    </div>
                  )}
                  {testResult.ok && testResult.models?.length === 0 && (
                    <div className="text-[#ffc820]">
                      Connected but no models found — run <code className="bg-primary/10 px-1">ollama pull gemma3:9b</code>
                    </div>
                  )}
                  {!testResult.ok && (
                    <div className="text-[#f03248]/80">{testResult.error}</div>
                  )}
                </div>
              )}

              <div className="p-3 border border-primary/10 bg-primary/5 font-mono text-xs text-primary/40 space-y-1">
                <div className="text-primary/60 mb-1">QUICK SETUP</div>
                <div>1. Install Ollama: <span className="text-primary">ollama.com/download</span></div>
                <div>2. Pull models: <span className="text-primary">ollama pull gemma3:9b &amp;&amp; ollama pull phi3</span></div>
                <div>3. Test connection above, then Save</div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* API KEYS tab */}
      {tab === "apikeys" && (
        <div className="grid gap-6 max-w-2xl">
          <div className="p-3 border border-[#ffc820]/30 bg-[#ffc820]/5 font-mono text-xs text-[#ffc820] flex items-start gap-2">
            <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            <span>
              API keys are stored in your local database. Only use cloud keys on machines you control.
              Leave blank to use local Ollama only — no cloud key is required for JARVIS to work.
            </span>
          </div>

          <Card className="bg-card/40 border-primary/20 rounded-none">
            <CardHeader className="border-b border-primary/20 p-4">
              <CardTitle className="font-mono text-xs text-primary flex items-center gap-2">
                <Key className="w-3.5 h-3.5" />
                CLOUD.API.KEYS — OPTIONAL
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 space-y-6">
              <p className="font-mono text-xs text-primary/50">
                Set these only if you want JARVIS to fall back to a cloud AI when Ollama is unavailable.
                Deck OS works fully offline without them.
              </p>

              {/* OpenAI */}
              <div className="space-y-2">
                <label className="font-mono text-xs text-primary/60 uppercase">OpenAI API Key</label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <input
                      type={showOai ? "text" : "password"}
                      value={cfg.OPENAI_API_KEY}
                      onChange={(e) => change("OPENAI_API_KEY", e.target.value)}
                      placeholder="sk-••••••••••••••••"
                      className="w-full bg-background border border-primary/30 px-3 py-2 pr-10 font-mono text-xs text-primary focus:border-primary focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => setShowOai((s) => !s)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-primary/40 hover:text-primary/70"
                    >
                      {showOai ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>
                <div className="font-mono text-xs text-primary/30">
                  Get one at platform.openai.com → API Keys
                </div>
              </div>

              {/* Anthropic */}
              <div className="space-y-2">
                <label className="font-mono text-xs text-primary/60 uppercase">Anthropic API Key</label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <input
                      type={showAnt ? "text" : "password"}
                      value={cfg.ANTHROPIC_API_KEY}
                      onChange={(e) => change("ANTHROPIC_API_KEY", e.target.value)}
                      placeholder="sk-ant-••••••••••••••••"
                      className="w-full bg-background border border-primary/30 px-3 py-2 pr-10 font-mono text-xs text-primary focus:border-primary focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => setShowAnt((s) => !s)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-primary/40 hover:text-primary/70"
                    >
                      {showAnt ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>
                <div className="font-mono text-xs text-primary/30">
                  Get one at console.anthropic.com → API Keys
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* MODELS tab */}
      {tab === "models" && (
        <div className="grid gap-6 max-w-2xl">
          <Card className="bg-card/40 border-primary/20 rounded-none">
            <CardHeader className="border-b border-primary/20 p-4">
              <CardTitle className="font-mono text-xs text-primary flex items-center gap-2">
                <Cpu className="w-3.5 h-3.5" />
                MODEL.ROUTING — 3 TIERS
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 space-y-6">
              <p className="font-mono text-xs text-primary/50 leading-relaxed">
                Deck OS routes every task to the right model automatically. Change these names to
                match whichever models you have installed in Ollama.
              </p>

              {/* CORTEX */}
              <div className="space-y-3 p-3 border border-primary/10">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-[#cc44ff]" />
                  <span className="font-mono text-xs text-primary font-bold">CORTEX — Deep Thinking Layer</span>
                </div>
                <p className="font-mono text-xs text-primary/40 leading-relaxed">
                  Used for: chat, planning, reasoning, briefings, summarization.
                  Pick your best / largest model. Gemma 3 9B is the default.
                </p>
                <div className="space-y-1">
                  <label className="font-mono text-xs text-primary/60">Model Name (exact Ollama name)</label>
                  <input
                    type="text"
                    value={cfg.REASONING_MODEL}
                    onChange={(e) => change("REASONING_MODEL", e.target.value)}
                    placeholder="gemma3:9b"
                    className="w-full bg-background border border-primary/30 px-3 py-2 font-mono text-xs text-primary focus:border-primary focus:outline-none"
                  />
                </div>
                <div className="font-mono text-xs text-primary/25">
                  Other options: llama3.2, mistral, qwen2.5, deepseek-r1
                </div>
              </div>

              {/* REFLEX */}
              <div className="space-y-3 p-3 border border-primary/10">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-[#ffc820]" />
                  <span className="font-mono text-xs text-primary font-bold">REFLEX — Fast Response Layer</span>
                </div>
                <p className="font-mono text-xs text-primary/40 leading-relaxed">
                  Used for: classification, command parsing, quick routing decisions.
                  Pick a small, fast model. Phi-3 Mini is the default.
                </p>
                <div className="space-y-1">
                  <label className="font-mono text-xs text-primary/60">Model Name (exact Ollama name)</label>
                  <input
                    type="text"
                    value={cfg.FAST_MODEL}
                    onChange={(e) => change("FAST_MODEL", e.target.value)}
                    placeholder="phi3"
                    className="w-full bg-background border border-primary/30 px-3 py-2 font-mono text-xs text-primary focus:border-primary focus:outline-none"
                  />
                </div>
                <div className="font-mono text-xs text-primary/25">
                  Other options: phi3.5, qwen2.5:0.5b, llama3.2:1b, tinyllama
                </div>
              </div>

              {/* AUTOPILOT */}
              <div className="p-3 border border-primary/10 opacity-60">
                <div className="flex items-center gap-2 mb-2">
                  <span className="w-2 h-2 rounded-full bg-[#11d97a]" />
                  <span className="font-mono text-xs text-primary font-bold">AUTOPILOT — Rule Engine</span>
                </div>
                <p className="font-mono text-xs text-primary/40">
                  Deterministic fallback — no model needed. Handles system status, device polling,
                  and all responses when Ollama is offline. Always available.
                </p>
              </div>

              <button
                onClick={() => {
                  change("REASONING_MODEL", DEFAULTS.REASONING_MODEL);
                  change("FAST_MODEL", DEFAULTS.FAST_MODEL);
                }}
                className="flex items-center gap-1.5 font-mono text-xs text-primary/40 hover:text-primary/70 transition-all"
              >
                <RotateCcw className="w-3 h-3" />
                RESET TO DEFAULTS (gemma3:9b / phi3)
              </button>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
