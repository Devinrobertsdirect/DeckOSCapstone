import { Router } from "express";
import { db, systemEventsTable } from "@workspace/db";
import { desc, eq, and, type SQL } from "drizzle-orm";
import { z } from "zod";

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

export default router;
