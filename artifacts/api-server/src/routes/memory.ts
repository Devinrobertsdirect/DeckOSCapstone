import { Router } from "express";
import { db, memoryEntriesTable } from "@workspace/db";
import { eq, like, or, ilike, desc } from "drizzle-orm";
import {
  GetShortTermMemoryResponse,
  StoreShortTermMemoryBody,
  GetLongTermMemoryQueryParams,
  GetLongTermMemoryResponse,
  StoreLongTermMemoryBody,
  DeleteMemoryEntryParams,
} from "@workspace/api-zod";

const router = Router();

function mapEntry(e: typeof memoryEntriesTable.$inferSelect) {
  return {
    id: String(e.id),
    type: e.type as "short_term" | "long_term",
    content: e.content,
    keywords: e.keywords ?? [],
    source: e.source,
    createdAt: e.createdAt.toISOString(),
    expiresAt: e.expiresAt ? e.expiresAt.toISOString() : null,
  };
}

router.get("/memory/short-term", async (req, res) => {
  const entries = await db.select().from(memoryEntriesTable)
    .where(eq(memoryEntriesTable.type, "short_term"))
    .orderBy(desc(memoryEntriesTable.createdAt))
    .limit(100);

  const body = GetShortTermMemoryResponse.parse({
    entries: entries.map(mapEntry),
    total: entries.length,
  });
  res.json(body);
});

router.post("/memory/short-term", async (req, res) => {
  const parsed = StoreShortTermMemoryBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { content, keywords, source, ttlSeconds } = parsed.data;
  const expiresAt = ttlSeconds ? new Date(Date.now() + ttlSeconds * 1000) : new Date(Date.now() + 3600000);

  const [entry] = await db.insert(memoryEntriesTable).values({
    type: "short_term",
    content,
    keywords: keywords ?? [],
    source,
    expiresAt,
  }).returning();

  res.status(201).json(mapEntry(entry));
});

router.get("/memory/long-term", async (req, res) => {
  const params = GetLongTermMemoryQueryParams.safeParse(req.query);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const { query, limit = 20 } = params.data;
  let entries;

  if (query) {
    entries = await db.select().from(memoryEntriesTable)
      .where(
        or(
          eq(memoryEntriesTable.type, "long_term"),
          ilike(memoryEntriesTable.content, `%${query}%`),
          ilike(memoryEntriesTable.source, `%${query}%`),
        )
      )
      .orderBy(desc(memoryEntriesTable.createdAt))
      .limit(limit ?? 20);

    entries = entries.filter((e) => e.type === "long_term");
  } else {
    entries = await db.select().from(memoryEntriesTable)
      .where(eq(memoryEntriesTable.type, "long_term"))
      .orderBy(desc(memoryEntriesTable.createdAt))
      .limit(limit ?? 20);
  }

  const body = GetLongTermMemoryResponse.parse({
    entries: entries.map(mapEntry),
    total: entries.length,
  });
  res.json(body);
});

router.post("/memory/long-term", async (req, res) => {
  const parsed = StoreLongTermMemoryBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { content, keywords, source } = parsed.data;
  const [entry] = await db.insert(memoryEntriesTable).values({
    type: "long_term",
    content,
    keywords: keywords ?? [],
    source,
    expiresAt: null,
  }).returning();

  res.status(201).json(mapEntry(entry));
});

router.delete("/memory/long-term/:id", async (req, res) => {
  const params = DeleteMemoryEntryParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  await db.delete(memoryEntriesTable).where(eq(memoryEntriesTable.id, parseInt(params.data.id)));
  res.status(204).send();
});

export default router;
