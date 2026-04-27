import { useState, useEffect, useCallback, useRef } from "react";
import {
  Settings as SettingsIcon, Wifi, Key, Cpu, CheckCircle2,
  XCircle, Loader2, Eye, EyeOff, Save, AlertTriangle, RotateCcw, Zap,
  Volume2, Mic, Globe, HardDrive, ShieldCheck, RefreshCw, Database, Server,
  Info, Terminal, Download, Bell, BellOff, Rocket, SlidersHorizontal,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type FeatureInfo = { available: boolean; provider: string | null; local?: boolean };
type FeatureMap = {
  inference: FeatureInfo & { fallback?: string };
  tts: FeatureInfo;
  stt: FeatureInfo;
  vision: FeatureInfo;
  store: FeatureInfo;
};

type Tab = "connection" | "apikeys" | "models" | "system" | "about";

type HealthStatus = {
  ok: boolean | null;
  label: string;
  checkedAt: string | null;
  hint: string;
};

type SystemHealth = {
  api: HealthStatus;
  db: HealthStatus;
  ollama: HealthStatus;
  openwebui: HealthStatus;
};

type ConfigState = {
  OLLAMA_HOST:          string;
  OPENWEBUI_HOST:       string;
  OPENWEBUI_API_KEY:    string;
  REASONING_MODEL:      string;
  FAST_MODEL:           string;
  OPENAI_API_KEY:       string;
  ANTHROPIC_API_KEY:    string;
  ELEVENLABS_API_KEY:   string;
  ELEVENLABS_VOICE_ID:  string;
  TTS_PROVIDER:         string;
};

type TestResult = { ok: boolean; models?: string[]; error?: string } | null;

const EL_PRESET_VOICES = [
  { id: "pNInz6obpgDQGcFmaJgB", name: "Adam",   desc: "Deep, authoritative" },
  { id: "21m00Tcm4TlvDq8ikWAM", name: "Rachel", desc: "Calm, professional" },
  { id: "TxGEqnHWrfWFTfGW9XjX", name: "Josh",   desc: "Confident, warm" },
  { id: "EXAVITQu4vr4xnSDxMaL", name: "Bella",  desc: "Friendly, clear" },
  { id: "VR6AewLTigWG4xSOukaG", name: "Arnold", desc: "Strong, steady" },
  { id: "MF3mGyEYCl7XYWbV9V6O", name: "Elli",   desc: "Expressive, natural" },
];

const DEFAULTS: ConfigState = {
  OLLAMA_HOST:         "http://localhost:11434",
  OPENWEBUI_HOST:      "",
  OPENWEBUI_API_KEY:   "",
  REASONING_MODEL:     "gemma3:9b",
  FAST_MODEL:          "phi3",
  OPENAI_API_KEY:      "",
  ANTHROPIC_API_KEY:   "",
  ELEVENLABS_API_KEY:  "",
  ELEVENLABS_VOICE_ID: EL_PRESET_VOICES[0].id,
  TTS_PROVIDER:        "auto",
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
  const [features, setFeatures] = useState<FeatureMap | null>(null);

  const [testing, setTesting]       = useState(false);
  const [testResult, setTestResult] = useState<TestResult>(null);

  const [owTesting, setOwTesting]       = useState(false);
  const [owTestResult, setOwTestResult] = useState<TestResult>(null);
  const [showOwKey, setShowOwKey]       = useState(false);

  const [showOai, setShowOai]     = useState(false);
  const [showAnt, setShowAnt]     = useState(false);
  const [showEl, setShowEl]       = useState(false);
  const [elTesting, setElTesting]         = useState(false);
  const [elTestOk, setElTestOk]           = useState<boolean | null>(null);
  const [localTesting, setLocalTesting]   = useState(false);
  const [localTestOk, setLocalTestOk]     = useState<boolean | null>(null);

  const [health, setHealth] = useState<SystemHealth | null>(null);
  const [healthChecking, setHealthChecking] = useState(false);

  const [isElectron, setIsElectron]                     = useState(false);
  const [desktopNotifEnabled, setDesktopNotifEnabled]   = useState(true);
  const [launchOnStartup, setLaunchOnStartup]           = useState(false);

  const [cpuThreshold, setCpuThreshold] = useState<number>(80);
  const [memThreshold, setMemThreshold] = useState<number>(90);
  const [thresholdSaving, setThresholdSaving] = useState(false);
  const [thresholdSaveOk, setThresholdSaveOk] = useState(false);
  const [thresholdDirty, setThresholdDirty] = useState(false);

  const [version, setVersion]               = useState<string | null>(null);
  const [adminConfigured, setAdminConfigured] = useState<boolean | null>(null);
  const [serverEnvironment, setServerEnvironment] = useState<"docker" | "bare-metal" | null>(null);
  const [adminSecretInput, setAdminSecretInput] = useState("");
  const [showSecret, setShowSecret]           = useState(false);
  const [updateRunning, setUpdateRunning]   = useState(false);
  const [updateLog, setUpdateLog]           = useState<{ line: string; stderr?: boolean }[]>([]);
  const [updateDone, setUpdateDone]         = useState<{ success: boolean; version?: string; error?: string } | null>(null);
  const logEndRef = useRef<HTMLDivElement>(null);

  const fetchHealth = useCallback(async () => {
    setHealthChecking(true);
    const now = new Date().toISOString();

    let apiOk = false;
    let dbOk = false;
    let apiCheckedAt = now;

    try {
      const r = await fetch("/api/healthz");
      if (r.ok) {
        const data = await r.json() as { status: string; db?: boolean; timestamp?: string };
        apiOk = data.status === "ok";
        dbOk = data.db ?? false;
        apiCheckedAt = data.timestamp ?? now;
      }
    } catch {
      apiOk = false;
      dbOk = false;
    }

    let ollamaOk = false;
    let openwebuiOk = false;
    let aiCheckedAt = now;

    try {
      const r = await fetch("/api/ai-router/status");
      if (r.ok) {
        const data = await r.json() as { ollamaAvailable: boolean; cloudAvailable: boolean; lastDetectedAt?: string };
        ollamaOk = data.ollamaAvailable;
        aiCheckedAt = data.lastDetectedAt ?? now;
      }
    } catch {
      ollamaOk = false;
    }

    const storedConfig = await fetch("/api/config").then((r) => r.json()).catch(() => ({ config: {} })) as { config: Record<string, string> };
    const owHost = storedConfig.config?.["OPENWEBUI_HOST"] ?? "";

    if (owHost.trim()) {
      try {
        const r = await fetch("/api/config/test-connection", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: owHost, type: "openwebui" }),
        });
        if (r.ok) {
          const data = await r.json() as { ok: boolean };
          openwebuiOk = data.ok;
        }
      } catch {
        openwebuiOk = false;
      }
    }

    setHealth({
      api: {
        ok: apiOk,
        label: "API SERVER",
        checkedAt: apiCheckedAt,
        hint: apiOk ? "" : "API server is not responding. Check that the Docker container is running: docker-compose ps",
      },
      db: {
        ok: dbOk,
        label: "DATABASE",
        checkedAt: apiCheckedAt,
        hint: dbOk ? "" : "Database is unreachable. Run: docker-compose logs db — and check migration status.",
      },
      ollama: {
        ok: ollamaOk,
        label: "OLLAMA",
        checkedAt: aiCheckedAt,
        hint: ollamaOk ? "" : "Ollama is offline. Start it with: ollama serve — and pull a model: ollama pull gemma3:9b",
      },
      openwebui: {
        ok: owHost.trim() ? openwebuiOk : null,
        label: "OPEN WEBUI",
        checkedAt: aiCheckedAt,
        hint: !owHost.trim()
          ? "No Open WebUI host configured — set it in the Connection tab to enable this check."
          : openwebuiOk
          ? ""
          : "Open WebUI is unreachable. Check it's running at the configured host and the API key is correct.",
      },
    });

    setHealthChecking(false);
  }, []);

  useEffect(() => {
    if (tab === "system" && !health && !healthChecking) {
      fetchHealth();
    }
  }, [tab, health, healthChecking, fetchHealth]);

  useEffect(() => {
    if (tab !== "system") return;
    fetch("/api/system/thresholds")
      .then((r) => r.json())
      .then((data: { cpuThreshold: number; memThreshold: number }) => {
        setCpuThreshold(data.cpuThreshold);
        setMemThreshold(data.memThreshold);
        setThresholdDirty(false);
      })
      .catch(() => {});
  }, [tab]);

  async function saveThresholds() {
    setThresholdSaving(true);
    try {
      await fetch("/api/system/thresholds", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cpuThreshold, memThreshold }),
      });
      setThresholdDirty(false);
      setThresholdSaveOk(true);
      setTimeout(() => setThresholdSaveOk(false), 3000);
    } finally {
      setThresholdSaving(false);
    }
  }

  useEffect(() => {
    if (tab !== "about" || version !== null) return;
    fetch("/api/admin/version")
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<{ version: string; adminConfigured: boolean; environment: "docker" | "bare-metal" }>;
      })
      .then((d) => {
        setVersion(d.version ?? "unknown");
        setAdminConfigured(!!d.adminConfigured);
        setServerEnvironment(d.environment ?? "bare-metal");
      })
      .catch(() => {
        setVersion("unknown");
        setAdminConfigured(false);
      });
  }, [tab, version]);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [updateLog]);

  useEffect(() => {
    const api = window.electronAPI;
    if (!api?.getNotificationsEnabled) return;
    setIsElectron(true);

    api.getNotificationsEnabled().then((v) => setDesktopNotifEnabled(v));
    api.getLaunchOnStartup?.().then((v) => setLaunchOnStartup(v));

    const cleanups: Array<() => void> = [];
    if (api.onNotificationsEnabledChanged) {
      cleanups.push(api.onNotificationsEnabledChanged((v) => setDesktopNotifEnabled(v)));
    }
    if (api.onLaunchOnStartupChanged) {
      cleanups.push(api.onLaunchOnStartupChanged((v) => setLaunchOnStartup(v)));
    }
    return () => cleanups.forEach((fn) => fn());
  }, []);

  useEffect(() => {
    fetch("/api/features")
      .then((r) => r.json())
      .then((data: FeatureMap) => setFeatures(data))
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetch("/api/config")
      .then((r) => r.json())
      .then((data: { config: Record<string, string> }) => {
        const c = data.config ?? {};
        setCfg({
          OLLAMA_HOST:         c["OLLAMA_HOST"]         ?? DEFAULTS.OLLAMA_HOST,
          OPENWEBUI_HOST:      c["OPENWEBUI_HOST"]      ?? "",
          OPENWEBUI_API_KEY:   c["OPENWEBUI_API_KEY"]   ?? "",
          REASONING_MODEL:     c["REASONING_MODEL"]     ?? DEFAULTS.REASONING_MODEL,
          FAST_MODEL:          c["FAST_MODEL"]           ?? DEFAULTS.FAST_MODEL,
          OPENAI_API_KEY:      c["OPENAI_API_KEY"]      ?? "",
          ANTHROPIC_API_KEY:   c["ANTHROPIC_API_KEY"]   ?? "",
          ELEVENLABS_API_KEY:  c["ELEVENLABS_API_KEY"]  ?? "",
          ELEVENLABS_VOICE_ID: c["ELEVENLABS_VOICE_ID"] ?? DEFAULTS.ELEVENLABS_VOICE_ID,
          TTS_PROVIDER:        c["TTS_PROVIDER"]         ?? "auto",
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

  async function testElevenLabs() {
    if (!cfg.ELEVENLABS_API_KEY.trim()) return;
    setElTesting(true);
    setElTestOk(null);
    try {
      // Save first so backend picks it up
      await fetch("/api/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ELEVENLABS_API_KEY:  cfg.ELEVENLABS_API_KEY,
          ELEVENLABS_VOICE_ID: cfg.ELEVENLABS_VOICE_ID,
          TTS_PROVIDER:        "elevenlabs",
        }),
      });
      const r = await fetch("/api/vision/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: "ElevenLabs voice connection confirmed." }),
      });
      if (!r.ok) throw new Error("TTS failed");
      const { audio, format } = await r.json() as { audio: string; format: string };
      const el = new Audio(`data:audio/${format};base64,${audio}`);
      const { attachAmplitudeAnalyser } = await import("@/lib/audioAnalyser");
      attachAmplitudeAnalyser(el);
      el.play().catch(() => {});
      setElTestOk(true);
      setCfg((prev) => ({ ...prev, TTS_PROVIDER: "elevenlabs" }));
      setDirty(false);
    } catch {
      setElTestOk(false);
    } finally {
      setElTesting(false);
    }
  }

  async function testLocalTts() {
    setLocalTesting(true);
    setLocalTestOk(null);
    try {
      await fetch("/api/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ TTS_PROVIDER: "local" }),
      });
      const r = await fetch("/api/vision/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: "Local offline voice confirmed. JARVIS online." }),
      });
      if (!r.ok) throw new Error("Local TTS request failed");
      const { audio, format } = await r.json() as { audio: string; format: string };
      const el = new Audio(`data:audio/${format};base64,${audio}`);
      const { attachAmplitudeAnalyser } = await import("@/lib/audioAnalyser");
      attachAmplitudeAnalyser(el);
      el.play().catch(() => {});
      setLocalTestOk(true);
      setCfg((prev) => ({ ...prev, TTS_PROVIDER: "local" }));
      setDirty(false);
    } catch {
      setLocalTestOk(false);
    } finally {
      setLocalTesting(false);
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

  async function testOpenWebUI() {
    if (!cfg.OPENWEBUI_HOST.trim()) return;
    setOwTesting(true);
    setOwTestResult(null);
    try {
      const r = await fetch("/api/config/test-connection", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ url: cfg.OPENWEBUI_HOST, type: "openwebui" }),
      });
      const data = await r.json() as TestResult;
      setOwTestResult(data);
    } catch {
      setOwTestResult({ ok: false, error: "Network error — is the API server running?" });
    } finally {
      setOwTesting(false);
    }
  }

  async function runUpdate() {
    if (!adminSecretInput.trim()) return;
    setUpdateRunning(true);
    setUpdateLog([]);
    setUpdateDone(null);

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "X-Admin-Token": adminSecretInput.trim(),
    };

    try {
      const startRes = await fetch("/api/admin/update", {
        method:  "POST",
        headers,
        body:    JSON.stringify({}),
      });
      if (!startRes.ok) {
        let errMsg = `Server error (${startRes.status})`;
        try {
          const j = await startRes.json() as { error?: string };
          if (j.error) errMsg = j.error;
        } catch {}
        setUpdateDone({ success: false, error: errMsg });
        return;
      }

      const streamRes = await fetch("/api/admin/update/stream", {
        headers: { "X-Admin-Token": adminSecretInput.trim() },
      });
      if (!streamRes.ok) {
        let errMsg = `Stream error (${streamRes.status})`;
        try { const j = await streamRes.json() as { error?: string }; if (j.error) errMsg = j.error; } catch {}
        setUpdateDone({ success: false, error: errMsg });
        setUpdateRunning(false);
        return;
      }
      if (!streamRes.body) throw new Error("No response body from stream");

      const reader = streamRes.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const parts = buf.split("\n\n");
        buf = parts.pop() ?? "";
        for (const part of parts) {
          const dataLine = part.split("\n").find((l) => l.startsWith("data:"));
          if (!dataLine) continue;
          try {
            const json = JSON.parse(dataLine.slice(5).trim()) as {
              type: string;
              line?: string;
              stderr?: boolean;
              success?: boolean;
              version?: string;
              error?: string;
            };
            if (json.type === "log" && json.line) {
              setUpdateLog((prev) => [...prev, { line: json.line!, stderr: json.stderr }]);
            } else if (json.type === "done") {
              setUpdateDone({ success: !!json.success, version: json.version, error: json.error });
              if (json.version) setVersion(json.version);
            }
          } catch {}
        }
      }
    } catch (err) {
      setUpdateDone({ success: false, error: String(err) });
    } finally {
      setUpdateRunning(false);
    }
  }

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: "connection", label: "CONNECTION",   icon: <Wifi className="w-3 h-3" /> },
    { id: "apikeys",    label: "API KEYS",      icon: <Key className="w-3 h-3" /> },
    { id: "models",     label: "MODELS",        icon: <Cpu className="w-3 h-3" /> },
    { id: "system",     label: "SYSTEM HEALTH", icon: <ShieldCheck className="w-3 h-3" /> },
    { id: "about",      label: "ABOUT & UPDATE",icon: <Info className="w-3 h-3" /> },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-2 font-mono text-xs text-primary/60 uppercase tracking-widest">
        <SettingsIcon className="w-4 h-4 text-primary" />
        <span>SYSTEM.SETTINGS // CONFIGURATION &amp; CONNECTIONS // DECK OS</span>
      </div>

      {/* Feature status strip */}
      {features && (
        <div className="grid grid-cols-5 gap-px border border-primary/20 bg-primary/5 font-mono text-[10px]">
          {([
            {
              key: "inference",
              label: "INFERENCE",
              icon: <HardDrive className="w-3 h-3" />,
              f: features.inference,
              localLabel: features.inference.provider === "rule-engine" ? "RULE ENGINE" : (features.inference.provider ?? "LOCAL").toUpperCase(),
            },
            {
              key: "tts",
              label: "VOICE TTS",
              icon: <Volume2 className="w-3 h-3" />,
              f: features.tts,
              localLabel: features.tts.provider === "local" ? "ESPEAK-NG" : features.tts.provider ? features.tts.provider.toUpperCase() : "DISABLED",
            },
            {
              key: "stt",
              label: "SPEECH STT",
              icon: <Mic className="w-3 h-3" />,
              f: features.stt,
              localLabel: features.stt.provider ? features.stt.provider.toUpperCase() : "DISABLED",
            },
            {
              key: "vision",
              label: "VISION",
              icon: <Cpu className="w-3 h-3" />,
              f: features.vision,
              localLabel: features.vision.provider ? features.vision.provider.toUpperCase() : "DISABLED",
            },
            {
              key: "store",
              label: "PLUGIN STORE",
              icon: <Globe className="w-3 h-3" />,
              f: features.store,
              localLabel: features.store.local ? "LOCAL" : "REMOTE",
            },
          ] as const).map(({ key, label, icon, f, localLabel }) => (
            <div key={key} className="flex flex-col gap-1 px-3 py-2 bg-card/30">
              <div className="flex items-center gap-1 text-primary/40 uppercase tracking-widest">
                {icon}{label}
              </div>
              <div className={`flex items-center gap-1 tracking-wider ${f.available ? "text-[#11d97a]" : "text-primary/30"}`}>
                {f.available
                  ? <><CheckCircle2 className="w-2.5 h-2.5" />{localLabel}</>
                  : <><XCircle className="w-2.5 h-2.5" />OFFLINE</>
                }
                {!f.local && f.available && (
                  <span className="text-primary/25 ml-1">CLOUD</span>
                )}
                {f.local && (
                  <span className="text-primary/25 ml-1">LOCAL</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

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

          {/* Open WebUI card */}
          <Card className="bg-card/40 border-primary/20 rounded-none">
            <CardHeader className="border-b border-primary/20 p-4">
              <CardTitle className="font-mono text-xs text-primary flex items-center gap-2">
                <Wifi className="w-3.5 h-3.5" />
                OPEN WEBUI (OPENCLAW) — OPTIONAL
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 space-y-4">
              <p className="font-mono text-xs text-primary/50 leading-relaxed">
                Open WebUI ("Openclaw") runs at <span className="text-primary">localhost:3000</span> by default and exposes
                an OpenAI-compatible API. When set, Deck OS uses it as a fallback when direct Ollama is unavailable,
                or as the primary engine when Ollama is offline. Leave blank to use Ollama directly.
              </p>

              <div className="space-y-2">
                <label className="font-mono text-xs text-primary/60 uppercase">Open WebUI Host URL</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={cfg.OPENWEBUI_HOST}
                    onChange={(e) => { change("OPENWEBUI_HOST", e.target.value); setOwTestResult(null); }}
                    placeholder="http://localhost:3000"
                    className="flex-1 bg-background border border-primary/30 px-3 py-2 font-mono text-xs text-primary focus:border-primary focus:outline-none"
                  />
                  <button
                    onClick={testOpenWebUI}
                    disabled={owTesting || !cfg.OPENWEBUI_HOST.trim()}
                    className="px-4 py-2 border border-primary/40 font-mono text-xs text-primary hover:bg-primary/10 transition-all disabled:opacity-50 flex items-center gap-1.5"
                  >
                    {owTesting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Zap className="w-3 h-3" />}
                    TEST
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                <label className="font-mono text-xs text-primary/60 uppercase">Open WebUI API Key (optional)</label>
                <div className="relative">
                  <input
                    type={showOwKey ? "text" : "password"}
                    value={cfg.OPENWEBUI_API_KEY}
                    onChange={(e) => change("OPENWEBUI_API_KEY", e.target.value)}
                    placeholder="Leave blank if auth is disabled"
                    className="w-full bg-background border border-primary/30 px-3 py-2 pr-10 font-mono text-xs text-primary focus:border-primary focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setShowOwKey((s) => !s)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-primary/40 hover:text-primary/70"
                  >
                    {showOwKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>

              {owTestResult && (
                <div className={`p-3 border font-mono text-xs space-y-1 ${owTestResult.ok ? "border-[#11d97a]/30 bg-[#11d97a]/5" : "border-[#f03248]/30 bg-[#f03248]/5"}`}>
                  <Badge ok={owTestResult.ok} />
                  {owTestResult.ok && owTestResult.models && owTestResult.models.length > 0 && (
                    <div className="text-primary/50 pt-1">
                      <span className="text-primary/30">AVAILABLE MODELS: </span>
                      {owTestResult.models.join(", ")}
                    </div>
                  )}
                  {!owTestResult.ok && (
                    <div className="text-[#f03248]/80">{owTestResult.error}</div>
                  )}
                </div>
              )}

              <div className="p-3 border border-primary/10 bg-primary/5 font-mono text-xs text-primary/40 space-y-1">
                <div className="text-primary/60 mb-1">ROUTING BEHAVIOR</div>
                <div>• Ollama host set + Open WebUI host set → <span className="text-primary">Ollama primary, Open WebUI fallback</span></div>
                <div>• Only Open WebUI set → <span className="text-primary">Open WebUI primary (model names must match)</span></div>
                <div>• Neither reachable → <span className="text-primary">Rule engine (autopilot) mode</span></div>
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
              Deck OS works fully offline without them — Ollama handles the AI.
            </span>
          </div>

          {/* ElevenLabs Voice */}
          <Card className="bg-card/40 border-primary/20 rounded-none">
            <CardHeader className="border-b border-primary/20 p-4">
              <CardTitle className="font-mono text-xs text-primary flex items-center gap-2">
                <Volume2 className="w-3.5 h-3.5" />
                ELEVENLABS — AI VOICE
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 space-y-5">
              <p className="font-mono text-xs text-primary/50 leading-relaxed">
                ElevenLabs powers JARVIS's spoken voice — the most realistic AI voices available.
                Get a free key at{" "}
                <a href="https://elevenlabs.io/app/settings/api-keys" target="_blank" rel="noopener noreferrer"
                   className="text-primary underline underline-offset-2">elevenlabs.io</a>.
              </p>

              {/* API Key */}
              <div className="space-y-2">
                <label className="font-mono text-xs text-primary/60 uppercase">ElevenLabs API Key</label>
                <div className="relative">
                  <input
                    type={showEl ? "text" : "password"}
                    value={cfg.ELEVENLABS_API_KEY}
                    onChange={(e) => { change("ELEVENLABS_API_KEY", e.target.value); setElTestOk(null); }}
                    placeholder="sk_••••••••••••••••"
                    className="w-full bg-background border border-primary/30 px-3 py-2 pr-10 font-mono text-xs text-primary focus:border-primary focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setShowEl((s) => !s)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-primary/40 hover:text-primary/70"
                  >
                    {showEl ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>

              {/* Voice Picker */}
              <div className="space-y-2">
                <label className="font-mono text-xs text-primary/60 uppercase">Voice</label>
                <div className="grid grid-cols-3 gap-2">
                  {EL_PRESET_VOICES.map((v) => (
                    <button
                      key={v.id}
                      onClick={() => { change("ELEVENLABS_VOICE_ID", v.id); setElTestOk(null); }}
                      className={`border px-3 py-2 text-left transition-all duration-200
                        ${cfg.ELEVENLABS_VOICE_ID === v.id
                          ? "border-primary bg-primary/10"
                          : "border-primary/20 hover:border-primary/50"
                        }`}
                    >
                      <div className={`font-mono text-xs font-bold ${cfg.ELEVENLABS_VOICE_ID === v.id ? "text-primary" : "text-primary/60"}`}>
                        {v.name}
                      </div>
                      <div className="font-mono text-[10px] text-primary/35 mt-0.5">{v.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* TTS Provider */}
              <div className="space-y-2">
                <label className="font-mono text-xs text-primary/60 uppercase">Voice Provider</label>
                <div className="flex gap-2">
                  {[
                    { val: "auto",       label: "AUTO (ElevenLabs → OpenAI → Local)" },
                    { val: "elevenlabs", label: "ElevenLabs Only" },
                    { val: "openai",     label: "OpenAI Only" },
                    { val: "local",      label: "Local (Offline)" },
                  ].map(({ val, label }) => (
                    <button
                      key={val}
                      onClick={() => change("TTS_PROVIDER", val)}
                      className={`font-mono text-xs px-3 py-1.5 border transition-all
                        ${cfg.TTS_PROVIDER === val
                          ? "border-primary text-primary bg-primary/10"
                          : "border-primary/20 text-primary/40 hover:border-primary/50 hover:text-primary/60"
                        }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Test buttons */}
              <div className="flex items-center gap-3 flex-wrap">
                <button
                  onClick={testElevenLabs}
                  disabled={elTesting || !cfg.ELEVENLABS_API_KEY.trim()}
                  className="flex items-center gap-1.5 px-4 py-2 border border-primary/40 font-mono text-xs text-primary hover:bg-primary/10 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {elTesting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Volume2 className="w-3 h-3" />}
                  {elTesting ? "TESTING..." : "TEST ELEVENLABS"}
                </button>
                {elTestOk === true  && <span className="font-mono text-xs text-[#11d97a] flex items-center gap-1"><CheckCircle2 className="w-3 h-3" />VOICE OK</span>}
                {elTestOk === false && <span className="font-mono text-xs text-[#f03248] flex items-center gap-1"><XCircle className="w-3 h-3" />CHECK KEY</span>}

                {features?.tts.local && (
                  <>
                    <button
                      onClick={testLocalTts}
                      disabled={localTesting}
                      className="flex items-center gap-1.5 px-4 py-2 border border-primary/40 font-mono text-xs text-primary hover:bg-primary/10 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {localTesting ? <Loader2 className="w-3 h-3 animate-spin" /> : <HardDrive className="w-3 h-3" />}
                      {localTesting ? "TESTING..." : "TEST LOCAL"}
                    </button>
                    {localTestOk === true  && <span className="font-mono text-xs text-[#11d97a] flex items-center gap-1"><CheckCircle2 className="w-3 h-3" />LOCAL OK</span>}
                    {localTestOk === false && <span className="font-mono text-xs text-[#f03248] flex items-center gap-1"><XCircle className="w-3 h-3" />LOCAL FAIL</span>}
                  </>
                )}
              </div>
            </CardContent>
          </Card>

          {/* OpenAI + Anthropic */}
          <Card className="bg-card/40 border-primary/20 rounded-none">
            <CardHeader className="border-b border-primary/20 p-4">
              <CardTitle className="font-mono text-xs text-primary flex items-center gap-2">
                <Key className="w-3.5 h-3.5" />
                CLOUD.AI.KEYS — OPTIONAL
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 space-y-6">
              <p className="font-mono text-xs text-primary/50">
                OpenAI is needed for speech-to-text (hearing your voice). Both keys are optional — JARVIS runs fully offline on Ollama.
              </p>

              {/* OpenAI */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Mic className="w-3 h-3 text-primary/40" />
                  <label className="font-mono text-xs text-primary/60 uppercase">OpenAI Key <span className="text-primary/30 normal-case">(speech-to-text + cloud AI)</span></label>
                </div>
                <div className="relative">
                  <input
                    type={showOai ? "text" : "password"}
                    value={cfg.OPENAI_API_KEY}
                    onChange={(e) => change("OPENAI_API_KEY", e.target.value)}
                    placeholder="sk-••••••••••••••••"
                    className="w-full bg-background border border-primary/30 px-3 py-2 pr-10 font-mono text-xs text-primary focus:border-primary focus:outline-none"
                  />
                  <button type="button" onClick={() => setShowOai((s) => !s)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-primary/40 hover:text-primary/70">
                    {showOai ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
                <div className="font-mono text-xs text-primary/30">platform.openai.com → API Keys</div>
              </div>

              {/* Anthropic */}
              <div className="space-y-2">
                <label className="font-mono text-xs text-primary/60 uppercase">Anthropic Key <span className="text-primary/30 normal-case">(Claude fallback)</span></label>
                <div className="relative">
                  <input
                    type={showAnt ? "text" : "password"}
                    value={cfg.ANTHROPIC_API_KEY}
                    onChange={(e) => change("ANTHROPIC_API_KEY", e.target.value)}
                    placeholder="sk-ant-••••••••••••••••"
                    className="w-full bg-background border border-primary/30 px-3 py-2 pr-10 font-mono text-xs text-primary focus:border-primary focus:outline-none"
                  />
                  <button type="button" onClick={() => setShowAnt((s) => !s)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-primary/40 hover:text-primary/70">
                    {showAnt ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
                <div className="font-mono text-xs text-primary/30">console.anthropic.com → API Keys</div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* SYSTEM HEALTH tab */}
      {tab === "system" && (
        <div className="grid gap-6 max-w-2xl">
          <Card className="bg-card/40 border-primary/20 rounded-none">
            <CardHeader className="border-b border-primary/20 p-4">
              <CardTitle className="font-mono text-xs text-primary flex items-center gap-2 justify-between">
                <span className="flex items-center gap-2">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  SYSTEM.HEALTH // DOCKER SETUP STATUS
                </span>
                <button
                  onClick={fetchHealth}
                  disabled={healthChecking}
                  className="flex items-center gap-1.5 px-3 py-1 border border-primary/40 font-mono text-xs text-primary hover:bg-primary/10 transition-all disabled:opacity-50"
                >
                  {healthChecking
                    ? <Loader2 className="w-3 h-3 animate-spin" />
                    : <RefreshCw className="w-3 h-3" />
                  }
                  RE-CHECK
                </button>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {!health && healthChecking && (
                <div className="flex items-center gap-2 p-6 font-mono text-xs text-primary/40">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  RUNNING HEALTH CHECKS...
                </div>
              )}
              {health && (
                <div className="divide-y divide-primary/10">
                  {(
                    [
                      { key: "api",      icon: <Server className="w-3.5 h-3.5" />,   s: health.api },
                      { key: "db",       icon: <Database className="w-3.5 h-3.5" />,  s: health.db },
                      { key: "ollama",   icon: <HardDrive className="w-3.5 h-3.5" />, s: health.ollama },
                      { key: "openwebui",icon: <Globe className="w-3.5 h-3.5" />,     s: health.openwebui },
                    ] as const
                  ).map(({ key, icon, s }) => (
                    <div key={key} className="p-4 space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 font-mono text-xs text-primary/60">
                          {icon}
                          <span className="uppercase tracking-widest">{s.label}</span>
                        </div>
                        <div className="flex items-center gap-3">
                          {s.checkedAt && (
                            <span className="font-mono text-[10px] text-primary/25">
                              {new Date(s.checkedAt).toLocaleTimeString()}
                            </span>
                          )}
                          {s.ok === null ? (
                            <span className="flex items-center gap-1 font-mono text-xs text-primary/30">
                              <XCircle className="w-3 h-3" />NOT CONFIGURED
                            </span>
                          ) : s.ok ? (
                            <span className="flex items-center gap-1 font-mono text-xs text-[#11d97a]">
                              <CheckCircle2 className="w-3 h-3" />OK
                            </span>
                          ) : (
                            <span className="flex items-center gap-1 font-mono text-xs text-[#f03248]">
                              <XCircle className="w-3 h-3" />FAIL
                            </span>
                          )}
                        </div>
                      </div>
                      {s.hint && (
                        <div className={`font-mono text-[11px] leading-relaxed pl-5 ${s.ok === null ? "text-primary/30" : "text-[#ffc820]/80"}`}>
                          {s.hint}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Desktop Notifications — only shown when running inside the Electron wrapper */}
          {isElectron && (
            <Card className="bg-card/40 border-primary/20 rounded-none">
              <CardHeader className="border-b border-primary/20 p-4">
                <CardTitle className="font-mono text-xs text-primary flex items-center gap-2">
                  {desktopNotifEnabled
                    ? <Bell className="w-3.5 h-3.5" />
                    : <BellOff className="w-3.5 h-3.5 text-primary/40" />
                  }
                  DESKTOP NOTIFICATIONS
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4 flex items-center justify-between gap-6">
                <div className="space-y-1.5 flex-1">
                  <p className="font-mono text-xs text-primary/60 leading-relaxed">
                    Native OS alerts for system warnings, plugin errors, and completed routines.
                    Fires even when the Deck OS window is hidden in the tray.
                  </p>
                  {!desktopNotifEnabled && (
                    <p className="font-mono text-xs text-[#ffc820]/70 flex items-center gap-1">
                      <BellOff className="w-3 h-3" />
                      Notifications are muted — you can also unmute via the tray icon menu.
                    </p>
                  )}
                </div>
                <button
                  onClick={async () => {
                    const api = window.electronAPI;
                    if (!api?.setNotificationsEnabled) return;
                    const next = !desktopNotifEnabled;
                    setDesktopNotifEnabled(next);
                    await api.setNotificationsEnabled(next);
                  }}
                  className={`shrink-0 flex items-center gap-2 px-5 py-2 border font-mono text-xs transition-all ${
                    desktopNotifEnabled
                      ? "border-primary/60 bg-primary/10 text-primary hover:bg-primary/20"
                      : "border-primary/20 text-primary/40 hover:border-primary/40 hover:text-primary/60"
                  }`}
                >
                  {desktopNotifEnabled
                    ? <><Bell className="w-3 h-3" />ENABLED</>
                    : <><BellOff className="w-3 h-3" />MUTED</>
                  }
                </button>
              </CardContent>
            </Card>
          )}

          {/* Launch on Startup — only shown inside the Electron wrapper */}
          {isElectron && (
            <Card className="bg-card/40 border-primary/20 rounded-none">
              <CardHeader className="border-b border-primary/20 p-4">
                <CardTitle className="font-mono text-xs text-primary flex items-center gap-2">
                  <Rocket className={`w-3.5 h-3.5 ${launchOnStartup ? "" : "text-primary/40"}`} />
                  LAUNCH AT LOGIN
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4 flex items-center justify-between gap-6">
                <div className="space-y-1.5 flex-1">
                  <p className="font-mono text-xs text-primary/60 leading-relaxed">
                    Start Deck OS automatically when you log in to Windows or macOS.
                    The app will appear in the system tray — no manual launch needed.
                  </p>
                  {launchOnStartup && (
                    <p className="font-mono text-xs text-[#11d97a]/70 flex items-center gap-1">
                      <Rocket className="w-3 h-3" />
                      JARVIS will be ready in your tray from the moment you log in.
                    </p>
                  )}
                </div>
                <button
                  onClick={async () => {
                    const api = window.electronAPI;
                    if (!api?.setLaunchOnStartup) return;
                    const next = !launchOnStartup;
                    setLaunchOnStartup(next);
                    await api.setLaunchOnStartup(next);
                  }}
                  className={`shrink-0 flex items-center gap-2 px-5 py-2 border font-mono text-xs transition-all ${
                    launchOnStartup
                      ? "border-primary/60 bg-primary/10 text-primary hover:bg-primary/20"
                      : "border-primary/20 text-primary/40 hover:border-primary/40 hover:text-primary/60"
                  }`}
                >
                  <Rocket className="w-3 h-3" />
                  {launchOnStartup ? "ENABLED" : "DISABLED"}
                </button>
              </CardContent>
            </Card>
          )}

          <Card className="bg-card/40 border-primary/20 rounded-none">
            <CardHeader className="border-b border-primary/20 p-4">
              <CardTitle className="font-mono text-xs text-primary flex items-center gap-2 justify-between">
                <span className="flex items-center gap-2">
                  <SlidersHorizontal className="w-3.5 h-3.5" />
                  ALERT.THRESHOLDS // CPU &amp; MEMORY
                </span>
                <div className="flex items-center gap-2">
                  {thresholdSaveOk && (
                    <span className="text-[#11d97a] flex items-center gap-1 font-mono text-xs">
                      <CheckCircle2 className="w-3 h-3" /> SAVED
                    </span>
                  )}
                  {thresholdDirty && !thresholdSaveOk && (
                    <span className="text-[#ffc820] flex items-center gap-1 font-mono text-xs">
                      <AlertTriangle className="w-3 h-3" /> UNSAVED
                    </span>
                  )}
                  <button
                    onClick={saveThresholds}
                    disabled={thresholdSaving || !thresholdDirty}
                    className="flex items-center gap-1.5 px-3 py-1 border border-primary/40 font-mono text-xs text-primary hover:bg-primary/10 transition-all disabled:opacity-50"
                  >
                    {thresholdSaving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                    SAVE
                  </button>
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 space-y-6">
              <p className="font-mono text-xs text-primary/50 leading-relaxed">
                Set the percentage at which JARVIS fires a resource alert. Changes take effect on the next monitor cycle.
                Values are persisted per-user and override any server defaults.
              </p>

              {/* CPU threshold */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="font-mono text-xs text-primary/60 uppercase flex items-center gap-1.5">
                    <Cpu className="w-3 h-3" /> CPU Alert Threshold
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min={1}
                      max={100}
                      value={cpuThreshold}
                      onChange={(e) => {
                        const v = Math.min(100, Math.max(1, parseInt(e.target.value) || 1));
                        setCpuThreshold(v);
                        setThresholdDirty(true);
                      }}
                      className="w-16 bg-background border border-primary/30 px-2 py-1 font-mono text-xs text-primary text-center focus:border-primary focus:outline-none"
                    />
                    <span className="font-mono text-xs text-primary/50">%</span>
                  </div>
                </div>
                <input
                  type="range"
                  min={1}
                  max={100}
                  value={cpuThreshold}
                  onChange={(e) => {
                    setCpuThreshold(parseInt(e.target.value));
                    setThresholdDirty(true);
                  }}
                  className="w-full accent-primary h-1 bg-primary/20 appearance-none cursor-pointer"
                />
                <div className="flex justify-between font-mono text-[10px] text-primary/25">
                  <span>1%</span>
                  <span className={cpuThreshold >= 90 ? "text-[#f03248]" : cpuThreshold >= 70 ? "text-[#ffc820]" : "text-[#11d97a]"}>
                    {cpuThreshold}% {cpuThreshold < 70 ? "(LOW)" : cpuThreshold < 90 ? "(MEDIUM)" : "(HIGH)"}
                  </span>
                  <span>100%</span>
                </div>
              </div>

              {/* Memory threshold */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="font-mono text-xs text-primary/60 uppercase flex items-center gap-1.5">
                    <HardDrive className="w-3 h-3" /> Memory Alert Threshold
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min={1}
                      max={100}
                      value={memThreshold}
                      onChange={(e) => {
                        const v = Math.min(100, Math.max(1, parseInt(e.target.value) || 1));
                        setMemThreshold(v);
                        setThresholdDirty(true);
                      }}
                      className="w-16 bg-background border border-primary/30 px-2 py-1 font-mono text-xs text-primary text-center focus:border-primary focus:outline-none"
                    />
                    <span className="font-mono text-xs text-primary/50">%</span>
                  </div>
                </div>
                <input
                  type="range"
                  min={1}
                  max={100}
                  value={memThreshold}
                  onChange={(e) => {
                    setMemThreshold(parseInt(e.target.value));
                    setThresholdDirty(true);
                  }}
                  className="w-full accent-primary h-1 bg-primary/20 appearance-none cursor-pointer"
                />
                <div className="flex justify-between font-mono text-[10px] text-primary/25">
                  <span>1%</span>
                  <span className={memThreshold >= 90 ? "text-[#f03248]" : memThreshold >= 70 ? "text-[#ffc820]" : "text-[#11d97a]"}>
                    {memThreshold}% {memThreshold < 70 ? "(LOW)" : memThreshold < 90 ? "(MEDIUM)" : "(HIGH)"}
                  </span>
                  <span>100%</span>
                </div>
              </div>

              <div className="p-2 border border-primary/10 bg-primary/5 font-mono text-[11px] text-primary/40">
                Default: CPU 80% · MEM 90%. Override with env vars CPU_ALERT_THRESHOLD / MEM_ALERT_THRESHOLD, or save here to override both.
              </div>
            </CardContent>
          </Card>

          <div className="p-3 border border-primary/10 bg-primary/5 font-mono text-xs text-primary/40 space-y-1.5">
            <div className="text-primary/60 mb-1">DOCKER QUICK REFERENCE</div>
            <div>• Check all containers: <span className="text-primary">docker-compose ps</span></div>
            <div>• View API logs: <span className="text-primary">docker-compose logs api --tail=50</span></div>
            <div>• View DB logs: <span className="text-primary">docker-compose logs db --tail=50</span></div>
            <div>• Restart a service: <span className="text-primary">docker-compose restart api</span></div>
            <div>• Run migrations: <span className="text-primary">docker-compose run --rm api pnpm db:migrate</span></div>
          </div>
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
      {/* ABOUT & UPDATE tab */}
      {tab === "about" && (
        <div className="grid gap-6 max-w-2xl">
          {/* Version card */}
          <Card className="bg-card/40 border-primary/20 rounded-none">
            <CardHeader className="border-b border-primary/20 p-4">
              <CardTitle className="font-mono text-xs text-primary flex items-center gap-2">
                <Info className="w-3.5 h-3.5" />
                DECK OS — VERSION INFO
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 space-y-4">
              <div className="grid grid-cols-2 gap-px bg-primary/10">
                <div className="bg-card/60 p-4 space-y-1">
                  <div className="font-mono text-[10px] text-primary/40 uppercase tracking-widest">SYSTEM</div>
                  <div className="font-mono text-lg text-primary font-bold">DECK OS</div>
                  <div className="font-mono text-xs text-primary/40">JARVIS Command Center</div>
                </div>
                <div className="bg-card/60 p-4 space-y-1">
                  <div className="font-mono text-[10px] text-primary/40 uppercase tracking-widest">VERSION</div>
                  {version === null ? (
                    <div className="flex items-center gap-2 text-primary/40 font-mono text-sm">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      LOADING...
                    </div>
                  ) : (
                    <div className="font-mono text-lg text-[#11d97a] font-bold">{version}</div>
                  )}
                  <div className="font-mono text-xs text-primary/40">git describe --tags</div>
                </div>
              </div>

              <div className="p-3 border border-primary/10 bg-primary/5 font-mono text-xs text-primary/40 space-y-1">
                <div className="text-primary/60 mb-1">STACK</div>
                <div>• Runtime: <span className="text-primary">Node.js + Express 5 + PostgreSQL + Drizzle</span></div>
                <div>• Frontend: <span className="text-primary">React + Vite + Tailwind</span></div>
                <div>• AI: <span className="text-primary">Ollama (local) • OpenAI • Anthropic • ElevenLabs</span></div>
                <div>• Package manager: <span className="text-primary">pnpm monorepo</span></div>
              </div>
            </CardContent>
          </Card>

          {/* Self-update card */}
          <Card className="bg-card/40 border-primary/20 rounded-none">
            <CardHeader className="border-b border-primary/20 p-4">
              <CardTitle className="font-mono text-xs text-primary flex items-center gap-2">
                <Download className="w-3.5 h-3.5" />
                SELF.UPDATE — APPLY LATEST CHANGES
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 space-y-4">
              <p className="font-mono text-xs text-primary/50 leading-relaxed">
                Runs <code className="bg-primary/10 px-1 text-primary">update.sh --no-pull</code> on the server:
                reinstalls dependencies and applies any pending database migrations.
                Git pull is skipped (update the code manually, then click Run Update).
              </p>

              <div className="flex items-center gap-2 font-mono text-[10px]">
                <span className="text-primary/40">ENVIRONMENT:</span>
                <span className={`px-2 py-0.5 border font-bold ${serverEnvironment === "docker" ? "border-[#ffc820]/40 text-[#ffc820] bg-[#ffc820]/10" : "border-primary/40 text-primary bg-primary/10"}`}>
                  {serverEnvironment === null ? "DETECTING..." : serverEnvironment === "docker" ? "DOCKER CONTAINER" : "BARE-METAL"}
                </span>
              </div>

              {serverEnvironment === "docker" && (
                <div className="p-3 border border-[#ffc820]/30 bg-[#ffc820]/5 font-mono text-xs text-[#ffc820] space-y-2">
                  <div className="flex items-center gap-1.5 font-bold"><AlertTriangle className="w-3.5 h-3.5" />DOCKER MODE — REQUIRES SOCKET ACCESS</div>
                  <div className="text-[#ffc820]/80">
                    Running inside Docker. The update will execute <code className="bg-black/30 px-1">docker compose pull + up -d --build</code> via the Docker socket.
                    This requires the socket to be mounted in your compose file:
                  </div>
                  <div className="bg-black/40 border border-[#ffc820]/20 px-3 py-2 text-[#ffc820]/90 leading-relaxed">
                    {"volumes:\n  - /var/run/docker.sock:/var/run/docker.sock"}
                  </div>
                  <div className="text-[#ffc820]/80">
                    If the socket is not mounted, the update will fail with an error in the log below.
                    Alternatively, run from the host: <code className="bg-black/30 px-1">bash update.sh --docker</code>
                  </div>
                </div>
              )}

              {adminConfigured === false && serverEnvironment !== null && (
                <div className="p-3 border border-[#ffc820]/30 bg-[#ffc820]/5 font-mono text-xs text-[#ffc820] space-y-1.5">
                  <div className="flex items-center gap-1.5 font-bold"><AlertTriangle className="w-3.5 h-3.5" />ADMIN_SECRET NOT CONFIGURED</div>
                  <div className="text-[#ffc820]/80">Add to your <code className="bg-black/30 px-1">.env</code> file and restart the server:</div>
                  <div className="bg-black/40 border border-[#ffc820]/20 px-3 py-2 text-[#ffc820]/90 tracking-wider">
                    ADMIN_SECRET=your-strong-secret-here
                  </div>
                  <div className="text-[#ffc820]/80">Or use the CLI directly: <code className="bg-black/30 px-1">bash update.sh --no-pull</code></div>
                </div>
              )}

              {adminConfigured === true && serverEnvironment !== null && (
                <div className="space-y-2">
                  <label className="font-mono text-xs text-primary/60 uppercase">Admin Secret (from your .env ADMIN_SECRET)</label>
                  <div className="relative">
                    <input
                      type={showSecret ? "text" : "password"}
                      value={adminSecretInput}
                      onChange={(e) => { setAdminSecretInput(e.target.value); setUpdateDone(null); }}
                      placeholder="Enter ADMIN_SECRET value..."
                      className="w-full bg-background border border-primary/30 px-3 py-2 pr-10 font-mono text-xs text-primary focus:border-primary focus:outline-none"
                    />
                    <button type="button" onClick={() => setShowSecret((s) => !s)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-primary/40 hover:text-primary/70">
                      {showSecret ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>
              )}

              {adminConfigured === true && serverEnvironment !== null && (
                <button
                  onClick={runUpdate}
                  disabled={updateRunning || !adminSecretInput.trim()}
                  className="flex items-center gap-2 px-5 py-2.5 border border-primary/50 font-mono text-xs text-primary hover:bg-primary/10 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {updateRunning
                    ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />UPDATING...</>
                    : <><RefreshCw className="w-3.5 h-3.5" />RUN UPDATE</>
                  }
                </button>
              )}

              {/* Log terminal */}
              {(updateLog.length > 0 || updateRunning) && (
                <div className="border border-primary/20 bg-black/40 rounded-none">
                  <div className="flex items-center gap-2 px-3 py-2 border-b border-primary/20 font-mono text-[10px] text-primary/40">
                    <Terminal className="w-3 h-3" />
                    UPDATE LOG
                    {updateRunning && <Loader2 className="w-2.5 h-2.5 animate-spin ml-auto" />}
                  </div>
                  <div className="p-3 max-h-64 overflow-y-auto space-y-0.5 font-mono text-[11px] leading-relaxed">
                    {updateLog.map((entry, i) => (
                      <div
                        key={i}
                        className={entry.stderr ? "text-[#f03248]/70" : "text-primary/70"}
                      >
                        {entry.line}
                      </div>
                    ))}
                    <div ref={logEndRef} />
                  </div>
                </div>
              )}

              {/* Done banner */}
              {updateDone && (
                <div className={`p-3 border font-mono text-xs flex items-start gap-2 ${
                  updateDone.success
                    ? "border-[#11d97a]/30 bg-[#11d97a]/5 text-[#11d97a]"
                    : "border-[#f03248]/30 bg-[#f03248]/5 text-[#f03248]"
                }`}>
                  {updateDone.success
                    ? <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
                    : <XCircle className="w-4 h-4 mt-0.5 shrink-0" />
                  }
                  <div>
                    {updateDone.success
                      ? <>Update complete — now on <span className="font-bold">{updateDone.version ?? version}</span>. Restart dev servers to apply.</>
                      : <>Update failed. {updateDone.error ?? "Check the log above for details."}</>
                    }
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Manual update reference */}
          <div className="p-3 border border-primary/10 bg-primary/5 font-mono text-xs text-primary/40 space-y-1.5">
            <div className="text-primary/60 mb-1">MANUAL UPDATE COMMANDS</div>
            <div>• Bare-metal: <span className="text-primary">bash update.sh</span></div>
            <div>• Docker: <span className="text-primary">bash update.sh --docker</span></div>
            <div>• Skip git pull: <span className="text-primary">bash update.sh --no-pull</span></div>
            <div>• Restart servers: <span className="text-primary">bash setup.sh --start</span></div>
          </div>
        </div>
      )}
    </div>
  );
}
