import { Router } from "express";
import { z } from "zod";
import { db, userCognitiveModelTable, ucmSettingsTable, UCM_LAYERS } from "@workspace/db";
import { eq } from "drizzle-orm";
import { bus } from "../lib/bus.js";

const router = Router();

const LAYER_LABEL: Record<string, string> = {
  identity: "Identity Layer",
  preferences: "Preference Layer",
  context: "Context Layer",
  goals: "Goal Layer",
  behaviorPatterns: "Behavior Patterns",
  emotionalModel: "Emotional Model",
  domainExpertise: "Domain Expertise Map",
};

async function getOrCreateModel() {
  const rows = await db.select().from(userCognitiveModelTable).limit(1);
  if (rows.length > 0) return rows[0];
  const [created] = await db.insert(userCognitiveModelTable).values({}).returning();
  return created;
}

async function getOrCreateSettings() {
  const rows = await db.select().from(ucmSettingsTable).limit(1);
  if (rows.length > 0) return rows[0];
  const [created] = await db.insert(ucmSettingsTable).values({}).returning();
  return created;
}

function formatModel(row: typeof userCognitiveModelTable.$inferSelect) {
  return {
    id: row.id,
    updatedAt: row.updatedAt.toISOString(),
    layers: {
      identity: { label: LAYER_LABEL.identity, data: row.identity ?? {} },
      preferences: { label: LAYER_LABEL.preferences, data: row.preferences ?? {} },
      context: { label: LAYER_LABEL.context, data: row.context ?? {} },
      goals: { label: LAYER_LABEL.goals, data: row.goals ?? {} },
      behaviorPatterns: { label: LAYER_LABEL.behaviorPatterns, data: row.behaviorPatterns ?? {} },
      emotionalModel: { label: LAYER_LABEL.emotionalModel, data: row.emotionalModel ?? {} },
      domainExpertise: { label: LAYER_LABEL.domainExpertise, data: row.domainExpertise ?? {} },
    },
  };
}

const PatchLayerBody = z.object({
  data: z.record(z.string(), z.unknown()),
  merge: z.boolean().optional().default(true),
});

const PatchSettingsBody = z.object({
  proactiveMode: z.boolean().optional(),
  memoryRetentionLevel: z.enum(["low", "medium", "high"]).optional(),
  emotionalModelingEnabled: z.boolean().optional(),
  personalizationLevel: z.enum(["off", "minimal", "full"]).optional(),
});

const VALID_LAYERS = new Set(UCM_LAYERS);

router.get("/ucm", async (req, res) => {
  const model = await getOrCreateModel();
  res.json(formatModel(model));
});

router.patch("/ucm/:layer", async (req, res) => {
  const layer = req.params.layer;
  if (!VALID_LAYERS.has(layer as typeof UCM_LAYERS[number])) {
    res.status(400).json({ error: `Invalid layer. Must be one of: ${UCM_LAYERS.join(", ")}` });
    return;
  }

  const parsed = PatchLayerBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { data, merge } = parsed.data;
  const model = await getOrCreateModel();
  const current = (model[layer as keyof typeof model] as Record<string, unknown>) ?? {};
  const updated = merge ? { ...current, ...data } : data;

  await db.update(userCognitiveModelTable)
    .set({ [layer]: updated })
    .where(eq(userCognitiveModelTable.id, model.id));

  bus.emit({
    source: "ucm",
    target: null,
    type: "memory.stored",
    payload: { layer, keys: Object.keys(data), operation: "patch" },
  });

  const fresh = await getOrCreateModel();
  res.json(formatModel(fresh));
});

router.delete("/ucm/:layer", async (req, res) => {
  const layer = req.params.layer;
  if (!VALID_LAYERS.has(layer as typeof UCM_LAYERS[number])) {
    res.status(400).json({ error: `Invalid layer. Must be one of: ${UCM_LAYERS.join(", ")}` });
    return;
  }

  const model = await getOrCreateModel();
  await db.update(userCognitiveModelTable)
    .set({ [layer]: {} })
    .where(eq(userCognitiveModelTable.id, model.id));

  bus.emit({
    source: "ucm",
    target: null,
    type: "memory.deleted",
    payload: { layer, operation: "clear" },
  });

  res.json({ success: true, layer, cleared: true });
});

router.delete("/ucm", async (req, res) => {
  const model = await getOrCreateModel();
  await db.update(userCognitiveModelTable)
    .set({
      identity: {},
      preferences: {},
      context: {},
      goals: {},
      behaviorPatterns: {},
      emotionalModel: {},
      domainExpertise: {},
    })
    .where(eq(userCognitiveModelTable.id, model.id));

  bus.emit({
    source: "ucm",
    target: null,
    type: "memory.deleted",
    payload: { operation: "full-reset" },
  });

  res.json({ success: true, cleared: true });
});

router.get("/ucm/settings", async (req, res) => {
  const settings = await getOrCreateSettings();
  res.json({
    proactiveMode: settings.proactiveMode,
    memoryRetentionLevel: settings.memoryRetentionLevel,
    emotionalModelingEnabled: settings.emotionalModelingEnabled,
    personalizationLevel: settings.personalizationLevel,
    updatedAt: settings.updatedAt.toISOString(),
  });
});

router.put("/ucm/settings", async (req, res) => {
  const parsed = PatchSettingsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const settings = await getOrCreateSettings();
  const updates: Record<string, unknown> = {};
  if (parsed.data.proactiveMode !== undefined) updates.proactiveMode = parsed.data.proactiveMode;
  if (parsed.data.memoryRetentionLevel !== undefined) updates.memoryRetentionLevel = parsed.data.memoryRetentionLevel;
  if (parsed.data.emotionalModelingEnabled !== undefined) updates.emotionalModelingEnabled = parsed.data.emotionalModelingEnabled;
  if (parsed.data.personalizationLevel !== undefined) updates.personalizationLevel = parsed.data.personalizationLevel;

  await db.update(ucmSettingsTable)
    .set(updates as Partial<typeof ucmSettingsTable.$inferSelect>)
    .where(eq(ucmSettingsTable.id, settings.id));

  bus.emit({
    source: "ucm",
    target: null,
    type: "system.config_changed",
    payload: { component: "ucm_settings", changes: updates },
  });

  const fresh = await getOrCreateSettings();
  res.json({
    proactiveMode: fresh.proactiveMode,
    memoryRetentionLevel: fresh.memoryRetentionLevel,
    emotionalModelingEnabled: fresh.emotionalModelingEnabled,
    personalizationLevel: fresh.personalizationLevel,
    updatedAt: fresh.updatedAt.toISOString(),
  });
});

export default router;
