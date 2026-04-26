import { Router } from "express";
import {
  GetAiRouterStatusResponse,
  ListAvailableModelsResponse,
  RouteInferenceBody,
  RouteInferenceResponse,
  GetIntelligenceModeResponse,
  SetIntelligenceModeBody,
  SetIntelligenceModeResponse,
} from "@workspace/api-zod";
import {
  runInference,
  refreshOllamaDetection,
  getInferenceState,
} from "../lib/inference.js";

const router = Router();

type IntelligenceMode = "DIRECT_EXECUTION" | "LIGHT_REASONING" | "DEEP_REASONING" | "HYBRID_MODE";

const routerState: {
  mode: IntelligenceMode;
} = {
  mode: "DIRECT_EXECUTION",
};

async function detectCloud(): Promise<boolean> {
  return !!(process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY);
}

refreshOllamaDetection().catch(() => {
  getInferenceState().ollamaAvailable = false;
});

setInterval(() => {
  refreshOllamaDetection().catch(() => {});
}, 30_000);

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

router.get("/ai-router/status", async (req, res) => {
  const cloudAvailable = await detectCloud();
  const state = getInferenceState();
  const activeModel = state.ollamaAvailable ? "mistral:instruct" : null;

  const body = GetAiRouterStatusResponse.parse({
    mode: routerState.mode,
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
  const state = getInferenceState();
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

  try {
    const result = await runInference({
      prompt,
      mode,
      context: context as Array<{ role: string; content: string }>,
      useCache,
    });

    const body = RouteInferenceResponse.parse({
      response: result.response,
      modelUsed: result.modelUsed,
      mode,
      fromCache: result.fromCache,
      latencyMs: result.latencyMs,
      tokens: null,
    });
    res.json(body);
  } catch (err) {
    req.log.error({ err }, "Inference failed");
    res.status(500).json({ error: "Inference failed" });
  }
});

router.get("/ai-router/mode", (req, res) => {
  const body = GetIntelligenceModeResponse.parse({
    mode: routerState.mode,
    description: MODE_DESCRIPTIONS[routerState.mode],
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
  routerState.mode = parsed.data.mode as IntelligenceMode;
  req.log.info({ mode: routerState.mode }, "Intelligence mode changed");

  const body = SetIntelligenceModeResponse.parse({
    mode: routerState.mode,
    description: MODE_DESCRIPTIONS[routerState.mode],
    preferLocal: true,
  });
  res.json(body);
});

export default router;
