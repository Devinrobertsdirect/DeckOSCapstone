import { useEffect, useRef, useState, useCallback } from "react";
import { useVoiceRecorder } from "./hooks/useVoiceRecorder";
import { useAudioPlayback } from "./hooks/useAudioPlayback";

const API_BASE = `${window.location.origin}/api`;
const WS_URL = `${window.location.protocol === "https:" ? "wss" : "ws"}://${window.location.host}/api/ws`;

type Role = "user" | "assistant" | "system";
type Channel = "web" | "mobile" | "whatsapp" | "voice";

type SensorSnapshot = {
  gps?: { lat: number; lon: number; accuracy: number; altitude?: number; speed?: number };
  battery?: { level: number; charging: boolean };
  network?: { type: string; downlink?: number; effectiveType?: string };
  orientation?: { alpha: number; beta: number; gamma: number };
};

function useSensorBridge(sendMessage: (d: unknown) => void, wsState: string) {
  const snap = useRef<SensorSnapshot>({});

  useEffect(() => {
    if (!navigator.geolocation) return;
    const id = navigator.geolocation.watchPosition(
      (p) => {
        snap.current.gps = {
          lat: p.coords.latitude,
          lon: p.coords.longitude,
          accuracy: Math.round(p.coords.accuracy),
          altitude: p.coords.altitude ?? undefined,
          speed: p.coords.speed ?? undefined,
        };
      },
      () => {},
      { enableHighAccuracy: false, maximumAge: 30_000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, []);

  useEffect(() => {
    type BatteryMgr = EventTarget & { level: number; charging: boolean };
    const nav = navigator as Navigator & { getBattery?: () => Promise<BatteryMgr> };
    if (!nav.getBattery) return;
    nav.getBattery().then((b) => {
      const upd = () => { snap.current.battery = { level: b.level, charging: b.charging }; };
      upd();
      b.addEventListener("levelchange", upd);
      b.addEventListener("chargingchange", upd);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    type Conn = EventTarget & { type?: string; downlink?: number; effectiveType?: string };
    const conn = (navigator as Navigator & { connection?: Conn }).connection;
    if (!conn) return;
    const upd = () => {
      snap.current.network = { type: conn.type ?? "unknown", downlink: conn.downlink, effectiveType: conn.effectiveType };
    };
    upd();
    conn.addEventListener("change", upd);
  }, []);

  useEffect(() => {
    const handler = (e: DeviceOrientationEvent) => {
      snap.current.orientation = { alpha: e.alpha ?? 0, beta: e.beta ?? 0, gamma: e.gamma ?? 0 };
    };
    window.addEventListener("deviceorientation", handler, true);
    return () => window.removeEventListener("deviceorientation", handler, true);
  }, []);

  useEffect(() => {
    if (wsState !== "open") return;
    const emit = () =>
      sendMessage({
        type: "device.reading",
        payload: {
          deviceId: `mobile-${SESSION_ID}`,
          deviceType: "mobile_browser",
          sensorType: "multi",
          values: { ...snap.current },
          timestamp: new Date().toISOString(),
        },
      });
    emit();
    const iv = setInterval(emit, 10_000);
    return () => clearInterval(iv);
  }, [wsState, sendMessage]);
}

interface ChatMsg {
  id: string;
  role: Role;
  content: string;
  channel?: Channel;
  modelUsed?: string;
  latencyMs?: number;
  fromCache?: boolean;
  reasonCode?: string;
  timestamp: string;
  pending?: boolean;
}

interface VoiceIdentity {
  voiceId: string;
  tone: string;
  pacing: string;
  formality: number;
  verbosity: number;
  emotionRange: string;
}

const SESSION_ID = `mobile_${Math.random().toString(36).slice(2, 10)}`;

function useWebSocket(onMessage: (data: unknown) => void) {
  const wsRef = useRef<WebSocket | null>(null);
  const [wsState, setWsState] = useState<"connecting" | "open" | "closed">("connecting");
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;
    setWsState("connecting");

    ws.onopen = () => setWsState("open");
    ws.onclose = () => {
      setWsState("closed");
      reconnectTimer.current = setTimeout(connect, 3000);
    };
    ws.onerror = () => ws.close();
    ws.onmessage = (e) => {
      try { onMessage(JSON.parse(e.data as string)); } catch {}
    };
  }, [onMessage]);

  useEffect(() => {
    connect();
    return () => {
      wsRef.current?.close();
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
    };
  }, [connect]);

  const sendMessage = useCallback((data: unknown) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(data));
    }
  }, []);

  return { wsState, sendMessage };
}

type VoicePipelineState = "idle" | "listening" | "transcribing" | "chatting" | "speaking" | "error";

export default function App() {
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [identity, setIdentity] = useState<VoiceIdentity | null>(null);
  const [showIdentity, setShowIdentity] = useState(false);
  const [aiName, setAiName] = useState("JARVIS");
  const [userName, setUserName] = useState<string | null>(null);
  const [voiceState, setVoiceState] = useState<VoicePipelineState>("idle");
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const voicePressedRef = useRef(false);

  const { recorderState, micDenied, supported: micSupported, startRecording, stopRecording, cancelRecording } = useVoiceRecorder();
  const { speak } = useAudioPlayback();

  const handleWsMessage = useCallback((data: unknown) => {
    const msg = data as { type: string; content?: string; modelUsed?: string; latencyMs?: number; timestamp?: string };
    if (msg.type === "chat.message" && msg.content) {
      // WS pushes AI responses from other channels — useful for multi-channel
      // (we already handle our own via HTTP response, so skip duplicates)
    }
  }, []);

  const { wsState, sendMessage } = useWebSocket(handleWsMessage);
  useSensorBridge(sendMessage, wsState);

  useEffect(() => {
    document.documentElement.classList.add("dark");

    const loadHistory = async () => {
      try {
        const res = await fetch(`${API_BASE}/chat/history?sessionId=${SESSION_ID}&limit=30`);
        const data = await res.json() as { messages: Array<{ id: number; role: string; content: string; channel: string; modelUsed?: string; latencyMs?: number; createdAt: string }> };
        const msgs: ChatMsg[] = data.messages.map((m) => ({
          id: String(m.id),
          role: m.role as Role,
          content: m.content,
          channel: m.channel as Channel,
          modelUsed: m.modelUsed ?? undefined,
          latencyMs: m.latencyMs ?? undefined,
          timestamp: m.createdAt,
        }));
        if (msgs.length > 0) setMessages(msgs);
        else setMessages([jarvisWelcome()]);
      } catch {
        setMessages([jarvisWelcome()]);
      }
    };

    const loadIdentity = async () => {
      try {
        const res = await fetch(`${API_BASE}/voice-identity`);
        setIdentity(await res.json() as VoiceIdentity);
      } catch {}
    };

    const loadUcmIdentity = async () => {
      try {
        const res  = await fetch(`${API_BASE}/ucm`);
        const data = await res.json() as { layers: { identity: { data: { aiName?: string; userName?: string } } } };
        const id   = data?.layers?.identity?.data;
        if (id?.aiName?.trim())   setAiName(id.aiName.trim());
        if (id?.userName?.trim()) setUserName(id.userName.trim());
      } catch {}
    };

    void loadHistory();
    void loadIdentity();
    void loadUcmIdentity();
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const send = async () => {
    const text = input.trim();
    if (!text || loading) return;
    setInput("");

    const userMsg: ChatMsg = {
      id: `u_${Date.now()}`,
      role: "user",
      content: text,
      channel: "mobile",
      timestamp: new Date().toISOString(),
    };
    const pendingMsg: ChatMsg = {
      id: `p_${Date.now()}`,
      role: "assistant",
      content: "",
      timestamp: new Date().toISOString(),
      pending: true,
    };

    setMessages((prev) => [...prev, userMsg, pendingMsg]);
    setLoading(true);

    try {
      const res = await fetch(`${API_BASE}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, channel: "mobile", sessionId: SESSION_ID }),
      });
      const data = await res.json() as { response: string; modelUsed: string; latencyMs: number; fromCache: boolean; reasonCode?: string };
      const aiMsg: ChatMsg = {
        id: `a_${Date.now()}`,
        role: "assistant",
        content: data.response,
        channel: "mobile",
        modelUsed: data.modelUsed,
        latencyMs: data.latencyMs,
        fromCache: data.fromCache,
        reasonCode: data.reasonCode,
        timestamp: new Date().toISOString(),
      };
      setMessages((prev) => [...prev.filter((m) => !m.pending), aiMsg]);
    } catch {
      setMessages((prev) => [...prev.filter((m) => !m.pending), {
        id: `e_${Date.now()}`,
        role: "assistant",
        content: "Connection lost. Please check your network.",
        timestamp: new Date().toISOString(),
      }]);
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void send();
    }
  };

  const onVoicePressStart = useCallback(async () => {
    if (loading || voiceState !== "idle" || !micSupported || micDenied) return;
    voicePressedRef.current = true;
    try {
      await startRecording();
      setVoiceState("listening");
    } catch {
      setVoiceState("error");
      setTimeout(() => setVoiceState("idle"), 2000);
    }
  }, [loading, voiceState, micSupported, micDenied, startRecording]);

  const onVoicePressEnd = useCallback(async () => {
    if (!voicePressedRef.current) return;
    voicePressedRef.current = false;
    if (recorderState !== "listening" && voiceState !== "listening") return;

    let base64Audio: string;
    try {
      base64Audio = await stopRecording();
    } catch {
      setVoiceState("error");
      setTimeout(() => setVoiceState("idle"), 2000);
      return;
    }

    if (!base64Audio || base64Audio.length < 100) { setVoiceState("idle"); return; }

    try {
      setVoiceState("transcribing");
      const sttRes = await fetch(`${API_BASE}/vision/stt`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ audio: base64Audio }),
      });
      if (!sttRes.ok) { setVoiceState("error"); setTimeout(() => setVoiceState("idle"), 2000); return; }
      const { transcript } = await sttRes.json() as { transcript: string };
      if (!transcript?.trim()) { setVoiceState("idle"); return; }

      const userMsg: ChatMsg = {
        id: `u_voice_${Date.now()}`,
        role: "user",
        content: transcript.trim(),
        channel: "voice",
        timestamp: new Date().toISOString(),
      };
      const pendingMsg: ChatMsg = {
        id: `p_voice_${Date.now()}`,
        role: "assistant",
        content: "",
        timestamp: new Date().toISOString(),
        pending: true,
      };
      setMessages((prev) => [...prev, userMsg, pendingMsg]);

      setVoiceState("chatting");
      const chatRes = await fetch(`${API_BASE}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: transcript.trim(), channel: "voice", sessionId: SESSION_ID }),
      });
      const chatData = await chatRes.json() as { response: string; modelUsed?: string; latencyMs?: number };
      const aiMsg: ChatMsg = {
        id: `a_voice_${Date.now()}`,
        role: "assistant",
        content: chatData.response,
        channel: "voice",
        modelUsed: chatData.modelUsed,
        latencyMs: chatData.latencyMs,
        timestamp: new Date().toISOString(),
      };
      setMessages((prev) => [...prev.filter((m) => !m.pending), aiMsg]);

      setVoiceState("speaking");
      const ttsRes = await fetch(`${API_BASE}/vision/tts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: chatData.response }),
      });
      if (ttsRes.ok) {
        const { audio } = await ttsRes.json() as { audio: string };
        await speak(audio);
      }
    } catch {
      setMessages((prev) => prev.filter((m) => !m.pending));
      setVoiceState("error");
      setTimeout(() => setVoiceState("idle"), 2000);
      return;
    }

    setVoiceState("idle");
  }, [voiceState, recorderState, stopRecording, speak]);

  const onVoiceCancel = useCallback(() => {
    if (!voicePressedRef.current) return;
    voicePressedRef.current = false;
    cancelRecording();
    setVoiceState("idle");
  }, [cancelRecording]);

  return (
    <div className="h-full flex flex-col bg-background text-foreground overflow-hidden select-none">
      <div className="scanline" />

      {/* HEADER */}
      <header className="shrink-0 border-b border-primary/30 bg-card/80 backdrop-blur px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full border-2 border-primary/60 flex items-center justify-center bg-primary/10">
            <span className="font-mono text-xs text-primary font-bold">{aiName.charAt(0).toUpperCase()}</span>
          </div>
          <div>
            <div className="font-bold text-primary tracking-widest text-sm uppercase leading-none">{aiName}</div>
            <div className="font-mono text-xs text-primary/40 leading-none mt-0.5">
              {userName ? `${userName} · Mobile` : "DeckOS.Mobile"}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowIdentity((v) => !v)}
            className={`font-mono text-xs px-2 py-1 border transition-colors ${showIdentity ? "border-primary/60 bg-primary/10 text-primary" : "border-primary/20 text-primary/40 hover:border-primary/40"}`}
          >
            VOICE.ID
          </button>
          <WsIndicator state={wsState} />
        </div>
      </header>

      {/* VOICE IDENTITY PANEL */}
      {showIdentity && identity && (
        <div className="shrink-0 border-b border-primary/20 bg-card/50 px-4 py-3">
          <div className="font-mono text-xs text-primary/40 uppercase tracking-widest mb-2">Voice Identity Profile</div>
          <div className="grid grid-cols-2 gap-x-6 gap-y-1 font-mono text-xs">
            <IdentityRow label="ID" value={identity.voiceId} />
            <IdentityRow label="Tone" value={identity.tone} />
            <IdentityRow label="Pacing" value={identity.pacing} />
            <IdentityRow label="Formality" value={`${identity.formality}%`} />
            <IdentityRow label="Verbosity" value={`${identity.verbosity}%`} />
            <IdentityRow label="Emotion" value={identity.emotionRange} />
          </div>
        </div>
      )}

      {/* MESSAGES */}
      <div className="flex-1 overflow-y-auto px-3 py-4 space-y-3 overscroll-contain">
        {messages.map((msg) => (
          <MessageBubble key={msg.id} msg={msg} />
        ))}
        <div ref={bottomRef} />
      </div>

      {/* CHANNEL INDICATOR */}
      <div className="shrink-0 flex items-center gap-2 px-4 py-1.5 border-t border-primary/10 bg-card/30">
        <span className="font-mono text-xs text-primary/30">CHANNEL:</span>
        <span className="font-mono text-xs text-[#00d4ff]">MOBILE</span>
        <span className="font-mono text-xs text-primary/20 ml-auto">SESSION.{SESSION_ID.slice(-6).toUpperCase()}</span>
      </div>

      {/* VOICE STATE INDICATOR */}
      {voiceState !== "idle" && (
        <div className={`shrink-0 px-4 py-2 border-t flex items-center gap-2 font-mono text-xs ${
          voiceState === "listening"   ? "border-[#f03248]/30 bg-[#f03248]/5 text-[#f03248]" :
          voiceState === "speaking"    ? "border-[#11d97a]/30 bg-[#11d97a]/5 text-[#11d97a]" :
          voiceState === "error"       ? "border-[#f03248]/30 bg-[#f03248]/5 text-[#f03248]" :
          "border-[#ffc820]/30 bg-[#ffc820]/5 text-[#ffc820]"
        }`}>
          <span className="animate-pulse">●</span>
          <span className="uppercase tracking-wider">
            {voiceState === "listening" ? "LISTENING — release to send" :
             voiceState === "transcribing" ? "TRANSCRIBING…" :
             voiceState === "chatting" ? "THINKING…" :
             voiceState === "speaking" ? "SPEAKING…" : "ERROR"}
          </span>
        </div>
      )}

      {/* INPUT */}
      <div className="shrink-0 border-t border-primary/30 bg-card/80 p-3">
        <div className={`flex gap-2 items-end border px-3 py-2 transition-colors ${loading ? "border-primary/20 opacity-60" : "pulse-border"}`}>
          <span className="font-mono text-primary/50 text-sm leading-none mt-1.5 shrink-0">&gt;</span>
          <textarea
            ref={inputRef}
            rows={1}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={loading}
            placeholder="Send a message..."
            className="flex-1 bg-transparent font-mono text-sm text-primary placeholder-primary/25 resize-none outline-none leading-5 max-h-28 disabled:cursor-not-allowed"
            style={{ minHeight: "1.25rem" }}
          />
          {micSupported && !micDenied && (
            <button
              type="button"
              disabled={loading || (voiceState !== "idle" && voiceState !== "listening")}
              className={`shrink-0 w-9 h-9 flex items-center justify-center border transition-all select-none touch-none ${
                voiceState === "listening" ? "border-[#f03248]/60 text-[#f03248]" :
                voiceState === "speaking"  ? "border-[#11d97a]/60 text-[#11d97a]" :
                voiceState !== "idle"      ? "border-[#ffc820]/40 text-[#ffc820]" :
                "border-primary/30 text-primary/50 hover:border-primary/60 hover:text-primary"
              }`}
              aria-label="Voice input"
              onMouseDown={(e) => { e.preventDefault(); void onVoicePressStart(); }}
              onMouseUp={() => void onVoicePressEnd()}
              onMouseLeave={() => { if (voicePressedRef.current) onVoiceCancel(); }}
              onTouchStart={(e) => { e.preventDefault(); void onVoicePressStart(); }}
              onTouchEnd={(e) => { e.preventDefault(); void onVoicePressEnd(); }}
              onTouchCancel={onVoiceCancel}
            >
              {voiceState === "listening" ? (
                <span className="text-[10px] font-mono animate-pulse">●</span>
              ) : voiceState === "speaking" ? (
                <span className="text-[10px] font-mono animate-pulse">♪</span>
              ) : voiceState !== "idle" ? (
                <span className="text-[10px] font-mono animate-spin inline-block">◌</span>
              ) : (
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
                  <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
                  <line x1="12" y1="19" x2="12" y2="23"/>
                  <line x1="8" y1="23" x2="16" y2="23"/>
                </svg>
              )}
            </button>
          )}
          <button
            onClick={() => void send()}
            disabled={loading || !input.trim()}
            className="shrink-0 font-mono text-xs px-3 py-1.5 border border-primary/40 text-primary bg-primary/10 hover:bg-primary/20 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            SEND
          </button>
        </div>
        <div className="font-mono text-xs text-primary/20 mt-1.5 text-right">↵ Enter to send · Shift+↵ newline · hold 🎤 to speak</div>
      </div>
    </div>
  );
}

function MessageBubble({ msg }: { msg: ChatMsg }) {
  const isUser = msg.role === "user";
  const isSystem = msg.role === "system";

  if (isSystem) {
    return (
      <div className="flex justify-center">
        <span className="font-mono text-xs text-primary/30 px-3 py-1 border border-primary/10 bg-card/30">{msg.content}</span>
      </div>
    );
  }

  return (
    <div className={`flex gap-2 msg-in ${isUser ? "flex-row-reverse" : "flex-row"}`}>
      {/* avatar */}
      <div className={`shrink-0 w-6 h-6 rounded-full border flex items-center justify-center font-mono text-xs mt-1 ${isUser ? "border-primary/30 bg-primary/10 text-primary" : "border-[#00d4ff]/30 bg-[#00d4ff]/5 text-[#00d4ff]"}`}>
        {isUser ? "U" : "J"}
      </div>

      {/* bubble */}
      <div className={`max-w-[80%] ${isUser ? "items-end" : "items-start"} flex flex-col gap-1`}>
        <div className={`px-3 py-2 border font-sans text-sm leading-relaxed ${isUser ? "border-primary/30 bg-primary/10 text-primary" : "border-[#00d4ff]/20 bg-[#00d4ff]/5 text-foreground"}`}>
          {msg.pending ? (
            <div className="flex gap-1.5 items-center h-4">
              <div className="typing-dot w-1.5 h-1.5 rounded-full bg-[#00d4ff]/60" />
              <div className="typing-dot w-1.5 h-1.5 rounded-full bg-[#00d4ff]/60" />
              <div className="typing-dot w-1.5 h-1.5 rounded-full bg-[#00d4ff]/60" />
            </div>
          ) : (
            <span className="whitespace-pre-wrap break-words">{msg.content}</span>
          )}
        </div>
        <div className="flex items-center gap-2 font-mono text-xs text-primary/25 flex-wrap">
          <span>{formatTime(msg.timestamp)}</span>
          {!msg.pending && msg.role === "assistant" && msg.modelUsed && (
            <ReasonBadge reasonCode={msg.reasonCode} modelUsed={msg.modelUsed} fromCache={msg.fromCache} latencyMs={msg.latencyMs} />
          )}
          {!msg.pending && msg.role === "assistant" && !msg.id.startsWith("welcome") && (
            <>
              <span>·</span>
              <span className="text-primary/15">saved to memory</span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function ReasonBadge({ reasonCode, modelUsed, fromCache, latencyMs }: {
  reasonCode?: string;
  modelUsed: string;
  fromCache?: boolean;
  latencyMs?: number;
}) {
  const code  = reasonCode ?? (fromCache ? "cached" : modelUsed.includes("rule-engine") ? "rule-engine" : "ai-inference");
  const label = code === "cached" ? "⚡ cached" : code === "rule-engine" ? "rule engine" : "AI inference";
  const color = code === "cached" ? "text-[#aa88ff]/50" : code === "rule-engine" ? "text-[#ffcc00]/40" : "text-[#00d4ff]/35";
  return (
    <>
      <span>·</span>
      <span className={color}>{label}</span>
      {!!latencyMs && latencyMs > 0 && (
        <>
          <span>·</span>
          <span>{latencyMs}ms</span>
        </>
      )}
    </>
  );
}

function WsIndicator({ state }: { state: "connecting" | "open" | "closed" }) {
  const color = state === "open" ? "bg-[#00ff88]" : state === "connecting" ? "bg-[#ffaa00]" : "bg-[#ff3333]";
  const label = state === "open" ? "LIVE" : state === "connecting" ? "SYNC" : "OFF";
  return (
    <div className="flex items-center gap-1.5 font-mono text-xs">
      <div className={`w-1.5 h-1.5 rounded-full ${color} ${state !== "open" ? "ws-blink" : ""}`} />
      <span className={state === "open" ? "text-[#00ff88]" : state === "connecting" ? "text-[#ffaa00]" : "text-[#ff3333]"}>{label}</span>
    </div>
  );
}

function IdentityRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-primary/40">{label}:</span>
      <span className="text-primary/70 truncate">{value}</span>
    </div>
  );
}

function jarvisWelcome(): ChatMsg {
  return {
    id: "welcome",
    role: "assistant",
    content: "DeckOS online. All systems nominal. How can I assist you?",
    channel: "mobile",
    timestamp: new Date().toISOString(),
  };
}

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}
