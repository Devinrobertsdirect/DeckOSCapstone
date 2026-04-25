import { Router } from "express";
import os from "os";
import { db, systemEventsTable, commandHistoryTable, memoryEntriesTable } from "@workspace/db";
import { desc } from "drizzle-orm";
import {
  GetSystemStatsResponse,
  GetSystemEventsQueryParams,
  GetSystemEventsResponse,
  GetSystemSummaryResponse,
} from "@workspace/api-zod";

const router = Router();

router.get("/system/stats", (req, res) => {
  const cpus = os.cpus();
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const usedMem = totalMem - freeMem;

  const cpuUsage = cpus.reduce((acc, cpu) => {
    const total = Object.values(cpu.times).reduce((a, b) => a + b, 0);
    const idle = cpu.times.idle;
    return acc + ((total - idle) / total) * 100;
  }, 0) / cpus.length;

  const body = GetSystemStatsResponse.parse({
    cpu: {
      usage: Math.round(cpuUsage * 10) / 10,
      cores: cpus.length,
      model: cpus[0]?.model ?? "Unknown",
    },
    memory: {
      used: Math.round(usedMem / 1024 / 1024),
      total: Math.round(totalMem / 1024 / 1024),
      percentage: Math.round((usedMem / totalMem) * 1000) / 10,
    },
    uptime: Math.floor(os.uptime()),
    loadAverage: os.loadavg(),
    platform: os.platform(),
    hostname: os.hostname(),
    timestamp: new Date().toISOString(),
  });
  res.json(body);
});

router.get("/system/events", async (req, res) => {
  const params = GetSystemEventsQueryParams.safeParse(req.query);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const limit = params.data.limit ?? 50;
  const rawEvents = await db.select().from(systemEventsTable)
    .orderBy(desc(systemEventsTable.createdAt))
    .limit(limit);

  const events = rawEvents.map((e) => ({
    id: String(e.id),
    level: e.level as "info" | "warning" | "error" | "critical",
    message: e.message,
    source: e.source,
    timestamp: e.createdAt.toISOString(),
    data: e.data as Record<string, unknown> | null,
  }));

  const body = GetSystemEventsResponse.parse({ events });
  res.json(body);
});

router.get("/system/summary", async (req, res) => {
  const [commandCount, memCount, alertCount] = await Promise.all([
    db.select().from(commandHistoryTable).then((r) => r.length),
    db.select().from(memoryEntriesTable).then((r) => r.length),
    db.select().from(systemEventsTable).then((r) => r.filter((e) => e.level === "error" || e.level === "critical").length),
  ]);

  const body = GetSystemSummaryResponse.parse({
    status: "optimal",
    activePlugins: 4,
    totalPlugins: 5,
    activeDevices: 4,
    totalDevices: 6,
    memoryEntries: memCount,
    commandsToday: commandCount,
    aiRequests: 0,
    uptimeSeconds: Math.floor(os.uptime()),
    alertCount,
  });
  res.json(body);
});

export default router;
