/**
 * /api/config — Runtime configuration management
 *
 * GET  /api/config          — read all non-sensitive config values
 * PUT  /api/config          — set one or more values
 * DELETE /api/config/:key   — remove a key
 * POST /api/config/test-connection — ping an Ollama URL and return available models
 */

import { Router } from "express";
import { z } from "zod/v4";
import { getConfig, setConfig, deleteConfig, getAllConfig, isSensitive } from "../lib/app-config.js";
import { invalidateConfigCache } from "../lib/app-config.js";

const router = Router();

// ── GET /api/config ────────────────────────────────────────────────────────
router.get("/config", async (_req, res) => {
  const config = await getAllConfig();

  // Merge with env defaults so the UI always shows a value
  const merged: Record<string, string> = {
    OLLAMA_HOST:     process.env["OLLAMA_HOST"]     ?? "http://localhost:11434",
    REASONING_MODEL: process.env["REASONING_MODEL"] ?? "gemma3:9b",
    FAST_MODEL:      process.env["FAST_MODEL"]      ?? "phi3",
    ...config,
  };

  res.json({ config: merged });
});

// ── PUT /api/config ─────────────────────────────────────────────────────────
const UpdateSchema = z.record(z.string(), z.string());

router.put("/config", async (req, res) => {
  const parsed = UpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Body must be a flat { key: value } object" });
    return;
  }

  const updates = parsed.data;
  for (const [key, value] of Object.entries(updates)) {
    await setConfig(key, value);
  }

  invalidateConfigCache();
  res.json({ ok: true, updated: Object.keys(updates) });
});

// ── DELETE /api/config/:key ──────────────────────────────────────────────────
router.delete("/config/:key", async (req, res) => {
  const key = req.params.key ?? "";
  if (!key) {
    res.status(400).json({ error: "Key required" });
    return;
  }
  await deleteConfig(key);
  res.json({ ok: true, deleted: key });
});

// ── POST /api/config/test-connection ─────────────────────────────────────────
const TestSchema = z.object({ url: z.string().url() });

router.post("/config/test-connection", async (req, res) => {
  const parsed = TestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ ok: false, error: "Provide { url: '...' }" });
    return;
  }

  const { url } = parsed.data;
  const base = url.replace(/\/$/, "");

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);
    const r = await fetch(`${base}/api/tags`, { signal: controller.signal });
    clearTimeout(timeout);

    if (!r.ok) {
      res.json({ ok: false, error: `Ollama responded with HTTP ${r.status}` });
      return;
    }

    const data = await r.json() as { models?: Array<{ name: string }> };
    const models = (data.models ?? []).map((m: { name: string }) => m.name);
    res.json({ ok: true, models, count: models.length });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.json({ ok: false, error: msg });
  }
});

export default router;
