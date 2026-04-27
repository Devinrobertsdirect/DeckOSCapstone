import { Plugin } from "@workspace/event-bus";
import type { PluginContext, BusEvent } from "@workspace/event-bus";
import {
  runInference,
  runInferenceStreaming,
  generateRuleBasedResponse,
  refreshOllamaDetection,
  getInferenceState,
} from "../lib/inference.js";
import { db, aiPersonaTable } from "@workspace/db";
import { checkEasterEgg } from "../lib/easter-eggs.js";

const MEMORY_CONTEXT_LIMIT = 5;

const FRONTEND_MODE_MAP: Record<string, "fast" | "deep" | "none"> = {
  DIRECT_EXECUTION: "none",
  LIGHT_REASONING: "fast",
  DEEP_REASONING: "deep",
  HYBRID_MODE: "fast",
  fast: "fast",
  deep: "deep",
  none: "none",
};

function resolveMode(raw: unknown): "fast" | "deep" | "none" {
  const key = String(raw ?? "DIRECT_EXECUTION");
  return FRONTEND_MODE_MAP[key] ?? "fast";
}

export default class AiChatPlugin extends Plugin {
  readonly id = "ai_chat";
  readonly name = "AI Chat";
  readonly version = "2.1.0";
  readonly description = "Conversational AI interface routed through the AI Router";
  readonly category = "ai";

  private ctx!: PluginContext;

  async init(context: PluginContext): Promise<void> {
    this.ctx = context;

    await refreshOllamaDetection();

    context.subscribe("ai.chat.request", async (event: BusEvent) => {
      if (event.type !== "ai.chat.request") return;
      const payload = event.payload as Record<string, unknown>;
      const prompt = String(payload?.prompt ?? "");
      const mode = resolveMode(payload?.mode);
      const extraContext = (payload?.context as Array<{ role: string; content: string }>) ?? [];
      const requestId = String(payload?.requestId ?? event.id);

      if (!prompt) {
        context.emit({
          source: this.id,
          target: event.source,
          type: "ai.chat.response",
          payload: {
            requestId,
            response: "[ai_chat] Empty prompt received.",
            modelUsed: "rule-engine-v1",
            latencyMs: 0,
            fromCache: false,
          },
        });
        return;
      }

      // ── Easter egg short-circuit ───────────────────────────────────────
      const personaRows = await db.select().from(aiPersonaTable).limit(1).catch(() => []);
      const personaCtx = personaRows.length > 0
        ? { aiName: personaRows[0]!.aiName, gender: personaRows[0]!.gender }
        : { aiName: "JARVIS", gender: "neutral" };
      const eggReply = checkEasterEgg(prompt, personaCtx);
      if (eggReply !== null) {
        context.emit({
          source: this.id,
          target: event.source,
          type: "ai.chat.token",
          payload: { requestId, token: eggReply },
        });
        context.emit({
          source: this.id,
          target: event.source,
          type: "ai.chat.response",
          payload: {
            requestId,
            response: eggReply,
            modelUsed: "easter-egg-v1",
            latencyMs: 1,
            fromCache: false,
          },
        });
        return;
      }
      // ──────────────────────────────────────────────────────────────────

      let enrichedPrompt = prompt;
      if (context.memory) {
        try {
          const memoryEntries = await context.memory.search(prompt, MEMORY_CONTEXT_LIMIT);
          if (memoryEntries.length > 0) {
            const memContext = memoryEntries
              .map((e) => `[Memory ${e.createdAt.toISOString()}] ${e.content}`)
              .join("\n");
            enrichedPrompt = `Relevant memory context:\n${memContext}\n\nUser query: ${prompt}`;
          }
        } catch {
          context.logger.warn("ai_chat: failed to retrieve memory context");
        }
      }

      // Broadcast thinking state immediately so the UI can animate before the LLM replies
      const emitThinking = (tier: string, model: string) => {
        context.emit({
          source:  this.id,
          target:  "broadcast",
          type:    "ai.inference_started",
          payload: { requestId, tier, model, thinking: true },
        });
      };

      const emitToken = (token: string) => {
        context.emit({
          source: this.id,
          target: event.source,
          type: "ai.chat.token",
          payload: { requestId, token },
        });
      };

      let result: { response: string; modelUsed: string; latencyMs: number; fromCache: boolean };

      if (context.infer) {
        result = await context.infer({
          prompt:   enrichedPrompt,
          mode,
          task:     "chat",
          context:  extraContext,
          useCache: false,
        });
        emitToken(result.response);
      } else {
        result = await runInferenceStreaming(
          {
            prompt:          enrichedPrompt,
            mode,
            task:            "chat",
            context:         extraContext,
            useCache:        false,
            onTierResolved:  emitThinking,
          },
          emitToken,
        );
      }

      context.emit({
        source: this.id,
        target: event.source,
        type: "ai.chat.response",
        payload: {
          requestId,
          response: result.response,
          modelUsed: result.modelUsed,
          latencyMs: result.latencyMs,
          fromCache: result.fromCache,
        },
      });

      if (context.memory) {
        try {
          await context.memory.store({
            type: "short_term",
            content: `Q: ${prompt}\nA: ${result.response}`,
            keywords: prompt
              .toLowerCase()
              .split(/\s+/)
              .filter((w) => w.length > 3)
              .slice(0, 10),
            source: this.id,
            ttlSeconds: 3600,
          });
        } catch {
          context.logger.warn("ai_chat: failed to write exchange to memory");
        }
      }
    });

    context.logger.info("AI Chat plugin initialized");
  }

  async on_event(event: BusEvent): Promise<void> {
    if (event.type !== "ai.chat.request") return;
  }

  async execute(payload: unknown): Promise<unknown> {
    const p = payload as Record<string, unknown> | null;
    const prompt = String(p?.prompt ?? p?.message ?? "");
    const mode = resolveMode(p?.mode);

    if (!prompt) {
      return { response: "No prompt provided.", modelUsed: "rule-engine-v1" };
    }

    const state = getInferenceState();
    if (!state.ollamaAvailable) {
      return {
        response: generateRuleBasedResponse(prompt),
        modelUsed: "rule-engine-v1",
      };
    }

    const result = await runInference({ prompt, mode, task: "chat" });
    return result;
  }

  async shutdown(): Promise<void> {
    this.ctx?.logger.info("AI Chat plugin stopped");
  }
}
