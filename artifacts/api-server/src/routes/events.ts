import { Router } from "express";
import { db, systemEventsTable } from "@workspace/db";
import { desc, eq, and, type SQL } from "drizzle-orm";
import { z } from "zod";
import { bus } from "../lib/bus.js";

const router = Router();

const EventsHistoryQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(500).default(50),
  offset: z.coerce.number().int().min(0).default(0),
  type: z.string().optional(),
  source: z.string().optional(),
});

router.get("/events/history", async (req, res) => {
  const parsed = EventsHistoryQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { limit, offset, type, source } = parsed.data;

  const conditions: SQL[] = [];
  if (type) {
    conditions.push(eq(systemEventsTable.message, type));
  }
  if (source) {
    conditions.push(eq(systemEventsTable.source, source));
  }

  const query = db
    .select()
    .from(systemEventsTable)
    .orderBy(desc(systemEventsTable.createdAt))
    .limit(limit)
    .offset(offset);

  if (conditions.length > 0) {
    const rows = await query.where(and(...conditions));
    const events = rows.map((row) => ({
      id: String(row.id),
      type: row.message,
      source: row.source,
      level: row.level,
      payload: row.data,
      timestamp: row.createdAt.toISOString(),
    }));
    res.json({ events, limit, offset });
  } else {
    const rows = await query;
    const events = rows.map((row) => ({
      id: String(row.id),
      type: row.message,
      source: row.source,
      level: row.level,
      payload: row.data,
      timestamp: row.createdAt.toISOString(),
    }));
    res.json({ events, limit, offset });
  }
});

const IngestBodySchema = z.object({
  source: z.string().min(1).max(128).default("webhook"),
  label:  z.string().max(128).optional(),
  payload: z.unknown().optional(),
  apiKey:  z.string().optional(),
});

router.post("/events/ingest", async (req, res) => {
  const webhookKey = process.env["WEBHOOK_API_KEY"];
  if (webhookKey) {
    const provided =
      (req.headers["x-api-key"] as string | undefined) ??
      (req.body as Record<string, unknown>)?.apiKey;
    if (provided !== webhookKey) {
      res.status(401).json({ error: "Unauthorized: invalid API key" });
      return;
    }
  }

  const parsed = IngestBodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { source, label, payload } = parsed.data;

  bus.emit({
    source,
    target: null,
    type: "device.reading",
    payload: {
      deviceId: source,
      deviceType: "external_webhook",
      sensorType: label ?? "external",
      values: payload ?? {},
      timestamp: new Date().toISOString(),
    },
  });

  res.json({ ok: true, received: new Date().toISOString() });
});

export default router;
