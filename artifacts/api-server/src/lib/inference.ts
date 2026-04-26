import os from "os";

export type InferenceMode = "fast" | "deep" | "none";

export type InferenceOptions = {
  prompt: string;
  mode: InferenceMode;
  context?: Array<{ role: string; content: string }>;
  useCache?: boolean;
};

export type InferenceResult = {
  response: string;
  modelUsed: string;
  latencyMs: number;
  fromCache: boolean;
};

const inferenceState: {
  totalRequests: number;
  cacheHits: number;
  cache: Map<string, { response: string; model: string; timestamp: number }>;
  ollamaAvailable: boolean | null;
  lastDetected: Date;
} = {
  totalRequests: 0,
  cacheHits: 0,
  cache: new Map(),
  ollamaAvailable: null,
  lastDetected: new Date(),
};

export function getInferenceState() {
  return inferenceState;
}

export async function detectOllama(): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2000);
    const res = await fetch("http://localhost:11434/api/tags", {
      signal: controller.signal,
    });
    clearTimeout(timeout);
    return res.ok;
  } catch {
    return false;
  }
}

export async function refreshOllamaDetection(): Promise<void> {
  inferenceState.ollamaAvailable = await detectOllama();
  inferenceState.lastDetected = new Date();
}

export function selectModel(mode: InferenceMode): string {
  if (mode === "none" || !inferenceState.ollamaAvailable) return "rule-engine-v1";
  if (mode === "fast") return "phi-3-mini";
  return "llama3:8b";
}

export function generateRuleBasedResponse(prompt: string): string {
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

export async function callOllama(
  prompt: string,
  model: string,
  context: Array<{ role: string; content: string }>,
): Promise<string> {
  const messages = [
    {
      role: "system",
      content:
        "You are JARVIS, a helpful AI assistant running as part of Deck OS, a local-first AI command center. Be concise and technical. Respond like a capable AI assistant, not a chatbot.",
    },
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

export async function runInference(opts: InferenceOptions): Promise<InferenceResult> {
  const { prompt, mode, context = [], useCache = true } = opts;
  inferenceState.totalRequests++;

  const cacheKey = `${mode}:${prompt}`;
  if (useCache && inferenceState.cache.has(cacheKey)) {
    const cached = inferenceState.cache.get(cacheKey)!;
    if (Date.now() - cached.timestamp < 300_000) {
      inferenceState.cacheHits++;
      return {
        response: cached.response,
        modelUsed: cached.model,
        latencyMs: 0,
        fromCache: true,
      };
    }
  }

  const start = Date.now();
  let response = "";
  let modelUsed = "rule-engine-v1";

  try {
    const targetModel = selectModel(mode);
    modelUsed = targetModel;

    if (targetModel === "rule-engine-v1" || !inferenceState.ollamaAvailable) {
      response = generateRuleBasedResponse(prompt);
      modelUsed = "rule-engine-v1";
    } else {
      response = await callOllama(prompt, targetModel, context);
    }
  } catch {
    response = generateRuleBasedResponse(prompt);
    modelUsed = "rule-engine-v1";
  }

  const latencyMs = Date.now() - start;

  if (useCache) {
    inferenceState.cache.set(cacheKey, {
      response,
      model: modelUsed,
      timestamp: Date.now(),
    });
    if (inferenceState.cache.size > 200) {
      const firstKey = inferenceState.cache.keys().next().value;
      if (firstKey) inferenceState.cache.delete(firstKey);
    }
  }

  return { response, modelUsed, latencyMs, fromCache: false };
}
