import { Router } from "express";
import os from "os";
import {
  GetAiRouterStatusResponse,
  ListAvailableModelsResponse,
  RouteInferenceBody,
  RouteInferenceResponse,
  GetIntelligenceModeResponse,
  SetIntelligenceModeBody,
  SetIntelligenceModeResponse,
} from "@workspace/api-zod";
import { logger } from "../lib/logger";

const router = Router();

type IntelligenceMode = "DIRECT_EXECUTION" | "LIGHT_REASONING" | "DEEP_REASONING" | "HYBRID_MODE";

const state: {
  mode: IntelligenceMode;
  totalRequests: number;
  cacheHits: number;
  cache: Map<string, { response: string; model: string; timestamp: number }>;
  ollamaAvailable: boolean | null;
  lastDetected: Date;
} = {
  mode: "DIRECT_EXECUTION",
  totalRequests: 0,
  cacheHits: 0,
  cache: new Map(),
  ollamaAvailable: null,
  lastDetected: new Date(),
};

async function detectOllama(): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2000);
    const res = await fetch("http://localhost:11434/api/tags", { signal: controller.signal });
    clearTimeout(timeout);
    return res.ok;
  } catch {
    return false;
  }
}

async function detectCloud(): Promise<boolean> {
  return !!(process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY);
}

async function refreshDetection() {
  state.ollamaAvailable = await detectOllama();
  state.lastDetected = new Date();
}

refreshDetection().catch(() => {
  state.ollamaAvailable = false;
});

setInterval(() => {
  refreshDetection().catch(() => {});
}, 30000);

const MODELS = [
  {
    id: "mistral:instruct",
    name: "Mistral Instruct",
    type: "local_ollama",
    contextLength: 8192,
    speed: "medium",
    tier: "light",
    endpoint: "http://localhost:11434",
  },
  {
    id: "llama3:8b",
    name: "Llama 3 8B",
    type: "local_ollama",
    contextLength: 8192,
    speed: "medium",
    tier: "deep",
    endpoint: "http://localhost:11434",
  },
  {
    id: "phi-3-mini",
    name: "Phi-3 Mini",
    type: "local_ollama",
    contextLength: 4096,
    speed: "fast",
    tier: "light",
    endpoint: "http://localhost:11434",
  },
  {
    id: "rule-engine-v1",
    name: "Rule Engine",
    type: "rule_engine",
    contextLength: 0,
    speed: "fast",
    tier: "fallback",
    endpoint: null,
  },
];

const MODE_DESCRIPTIONS: Record<IntelligenceMode, string> = {
  DIRECT_EXECUTION: "No LLM — run deterministic rule-based logic only",
  LIGHT_REASONING: "Use a small fast local model (phi-3-mini, mistral:instruct)",
  DEEP_REASONING: "Use a larger local or cloud model for complex reasoning",
  HYBRID_MODE: "Combine rule engine with LLM for balanced response",
};

function selectModel(mode: "fast" | "deep" | "none"): string {
  if (mode === "none" || !state.ollamaAvailable) return "rule-engine-v1";
  if (mode === "fast") return "phi-3-mini";
  return "llama3:8b";
}

function generateRuleBasedResponse(prompt: string): string {
  const p = prompt.toLowerCase();
  if (p.includes("status") || p.includes("health")) {
    return `[RULE ENGINE] System status: NOMINAL. All subsystems operational. Uptime: ${Math.floor(os.uptime() / 3600)}h ${Math.floor((os.uptime() % 3600) / 60)}m.`;
  }
  if (p.includes("cpu") || p.includes("memory") || p.includes("ram")) {
    const mem = os.totalmem() - os.freemem();
    return `[RULE ENGINE] CPU Load: ${os.loadavg()[0].toFixed(2)}. Memory used: ${Math.round(mem / 1024 / 1024)}MB / ${Math.round(os.totalmem() / 1024 / 1024)}MB.`;
  }
  if (p.includes("help") || p.includes("commands")) {
    return `[RULE ENGINE] Available commands: status, monitor, plugins list, devices list, memory search <query>, infer <prompt>.`;
  }
  if (p.includes("hello") || p.includes("jarvis") || p.includes("deck")) {
    return `[RULE ENGINE] DECK OS online. I am your local-first AI command center. All systems nominal. How may I assist?`;
  }
  return `[RULE ENGINE] Command processed. No LLM available — operating in deterministic fallback mode. Input received: "${prompt.substring(0, 80)}"`;
}

async function callOllama(prompt: string, model: string, context: Array<{ role: string; content: string }>): Promise<string> {
  const messages = [
    { role: "system", content: "You are JARVIS, a helpful AI assistant running as part of Deck OS, a local-first AI command center. Be concise and technical. Respond like a capable AI assistant, not a chatbot." },
    ...context,
    { role: "user", content: prompt },
  ];

  const res = await fetch("http://localhost:11434/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model, messages, stream: false }),
    signal: AbortSignal.timeout(30000),
  });

  if (!res.ok) throw new Error(`Ollama error: ${res.status}`);
  const data = (await res.json()) as { message?: { content?: string } };
  return data.message?.content ?? "[No response from model]";
}

router.get("/ai-router/status", async (req, res) => {
  const cloudAvailable = await detectCloud();
  const activeModel = state.ollamaAvailable ? "mistral:instruct" : null;

  const body = GetAiRouterStatusResponse.parse({
    mode: state.mode,
    activeModel,
    ollamaAvailable: state.ollamaAvailable ?? false,
    cloudAvailable,
    fallbackMode: !state.ollamaAvailable && !cloudAvailable,
    cacheHitRate: state.totalRequests > 0 ? state.cacheHits / state.totalRequests : 0,
    totalRequests: state.totalRequests,
    lastDetectedAt: state.lastDetected.toISOString(),
  });

  res.json(body);
});

router.get("/ai-router/models", async (req, res) => {
  const isOllamaUp = state.ollamaAvailable ?? false;
  const models = MODELS.map((m) => ({
    ...m,
    available: m.type === "rule_engine" ? true : m.type === "local_ollama" ? isOllamaUp : false,
  }));
  const body = ListAvailableModelsResponse.parse({ models });
  res.json(body);
});

router.post("/ai-router/infer", async (req, res) => {
  const parsed = RouteInferenceBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { prompt, mode, context = [], useCache = true } = parsed.data;
  state.totalRequests++;

  const cacheKey = `${mode}:${prompt}`;
  if (useCache && state.cache.has(cacheKey)) {
    const cached = state.cache.get(cacheKey)!;
    if (Date.now() - cached.timestamp < 300000) {
      state.cacheHits++;
      const body = RouteInferenceResponse.parse({
        response: cached.response,
        modelUsed: cached.model,
        mode,
        fromCache: true,
        latencyMs: 0,
        tokens: null,
      });
      res.json(body);
      return;
    }
  }

  const start = Date.now();
  let response = "";
  let modelUsed = "rule-engine-v1";

  try {
    const targetModel = selectModel(mode);
    modelUsed = targetModel;

    if (targetModel === "rule-engine-v1" || !state.ollamaAvailable) {
      response = generateRuleBasedResponse(prompt);
      modelUsed = "rule-engine-v1";
    } else {
      response = await callOllama(prompt, targetModel, context as Array<{ role: string; content: string }>);
    }
  } catch (err) {
    req.log.warn({ err }, "LLM inference failed, falling back to rule engine");
    response = generateRuleBasedResponse(prompt);
    modelUsed = "rule-engine-v1";
  }

  const latencyMs = Date.now() - start;
  if (useCache) {
    state.cache.set(cacheKey, { response, model: modelUsed, timestamp: Date.now() });
    if (state.cache.size > 200) {
      const firstKey = state.cache.keys().next().value;
      if (firstKey) state.cache.delete(firstKey);
    }
  }

  const body = RouteInferenceResponse.parse({
    response,
    modelUsed,
    mode,
    fromCache: false,
    latencyMs,
    tokens: null,
  });
  res.json(body);
});

router.get("/ai-router/mode", (req, res) => {
  const body = GetIntelligenceModeResponse.parse({
    mode: state.mode,
    description: MODE_DESCRIPTIONS[state.mode],
    preferLocal: true,
  });
  res.json(body);
});

router.put("/ai-router/mode", (req, res) => {
  const parsed = SetIntelligenceModeBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  state.mode = parsed.data.mode as IntelligenceMode;
  req.log.info({ mode: state.mode }, "Intelligence mode changed");

  const body = SetIntelligenceModeResponse.parse({
    mode: state.mode,
    description: MODE_DESCRIPTIONS[state.mode],
    preferLocal: true,
  });
  res.json(body);
});

export default router;
