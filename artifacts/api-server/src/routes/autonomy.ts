import { Router } from "express";
import { z } from "zod";
import { db, autonomyConfigTable, autonomyLogTable } from "@workspace/db";
import { desc, eq } from "drizzle-orm";
import { bus } from "../lib/bus.js";

const router = Router();

const DEFAULT_ALLOWED = [
  "fetch_device_status",
  "open_file",
  "schedule_reminder",
  "send_notification",
  "generate_summary",
  "refresh_memory",
  "query_goals",
];

const DEFAULT_BLOCKED = [
  "delete_file",
  "modify_system_config",
  "execute_shell",
  "send_message_external",
  "purchase",
  "irreversible_action",
];

const UpdateConfigBody = z.object({
  enabled: z.boolean().optional(),
  safetyLevel: z.enum(["strict", "moderate", "permissive"]).optional(),
  confirmationRequired: z.boolean().optional(),
  allowedActions: z.array(z.string()).optional(),
  blockedActions: z.array(z.string()).optional(),
});

const ExecuteActionBody = z.object({
  action: z.string().min(1),
  parameters: z.record(z.string(), z.unknown()).optional().default({}),
  requestedBy: z.string().optional().default("user"),
});

async function getOrCreateConfig() {
  const rows = await db.select().from(autonomyConfigTable).limit(1);
  if (rows.length > 0) return rows[0];
  const [created] = await db.insert(autonomyConfigTable).values({
    allowedActions: DEFAULT_ALLOWED,
    blockedActions: DEFAULT_BLOCKED,
  }).returning();
  return created;
}

function formatConfig(c: typeof autonomyConfigTable.$inferSelect) {
  return {
    enabled: c.enabled,
    safetyLevel: c.safetyLevel,
    confirmationRequired: c.confirmationRequired,
    allowedActions: c.allowedActions,
    blockedActions: c.blockedActions,
    updatedAt: c.updatedAt.toISOString(),
  };
}

function formatLog(l: typeof autonomyLogTable.$inferSelect) {
  return {
    id: l.id,
    action: l.action,
    actionType: l.actionType,
    parameters: l.parameters,
    outcome: l.outcome,
    reason: l.reason,
    createdAt: l.createdAt.toISOString(),
  };
}

function classifyAction(action: string, config: typeof autonomyConfigTable.$inferSelect): "allowed" | "blocked" | "requires_confirmation" {
  const allowed = config.allowedActions as string[];
  const blocked = config.blockedActions as string[];

  if (blocked.includes(action)) return "blocked";
  if (allowed.includes(action)) {
    if (config.confirmationRequired && config.safetyLevel === "strict") return "requires_confirmation";
    if (config.safetyLevel === "moderate") return "requires_confirmation";
    return "allowed";
  }
  return config.safetyLevel === "permissive" ? "requires_confirmation" : "blocked";
}

function simulateExecution(action: string, parameters: Record<string, unknown>): { outcome: string; result: string } {
  switch (action) {
    case "fetch_device_status":
      return { outcome: "success", result: "Device status fetched: all sensors nominal" };
    case "open_file":
      return { outcome: "success", result: `File '${parameters.path ?? "unknown"}' opened in viewer` };
    case "schedule_reminder":
      return { outcome: "success", result: `Reminder scheduled: "${parameters.message ?? "reminder"}" at ${parameters.time ?? "unspecified"}` };
    case "generate_summary":
      return { outcome: "success", result: "Summary generated from recent event history" };
    case "refresh_memory":
      return { outcome: "success", result: "Memory index refreshed — 0 expired entries cleared" };
    case "query_goals":
      return { outcome: "success", result: "Active goals queried and returned to requestor" };
    case "send_notification":
      return { outcome: "success", result: `Notification sent: "${parameters.message ?? "alert"}"` };
    default:
      return { outcome: "success", result: `Action '${action}' executed with provided parameters` };
  }
}

router.get("/autonomy/config", async (req, res) => {
  const config = await getOrCreateConfig();
  res.json(formatConfig(config));
});

router.put("/autonomy/config", async (req, res) => {
  const parsed = UpdateConfigBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const config = await getOrCreateConfig();
  const updates: Partial<typeof autonomyConfigTable.$inferInsert> = {};
  if (parsed.data.enabled !== undefined) updates.enabled = parsed.data.enabled;
  if (parsed.data.safetyLevel !== undefined) updates.safetyLevel = parsed.data.safetyLevel;
  if (parsed.data.confirmationRequired !== undefined) updates.confirmationRequired = parsed.data.confirmationRequired;
  if (parsed.data.allowedActions !== undefined) updates.allowedActions = parsed.data.allowedActions;
  if (parsed.data.blockedActions !== undefined) updates.blockedActions = parsed.data.blockedActions;

  const [updated] = await db.update(autonomyConfigTable).set(updates).where(eq(autonomyConfigTable.id, config.id)).returning();

  bus.emit({ source: "autonomy-controller", target: null, type: "system.config_changed", payload: { event: "autonomy.config_updated", changes: Object.keys(updates) } });

  res.json(formatConfig(updated));
});

router.post("/autonomy/execute", async (req, res) => {
  const parsed = ExecuteActionBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const { action, parameters, requestedBy } = parsed.data;
  const config = await getOrCreateConfig();

  if (!config.enabled) {
    const [log] = await db.insert(autonomyLogTable).values({
      action,
      actionType: "blocked",
      parameters,
      outcome: "blocked",
      reason: "Autonomy controller is disabled",
    }).returning();

    bus.emit({ source: "autonomy-controller", target: null, type: "system.error", payload: { event: "autonomy.action_blocked", action, reason: "disabled" } });

    res.status(403).json({ status: "blocked", reason: "Autonomy controller is disabled", log: formatLog(log) });
    return;
  }

  const classification = classifyAction(action, config);

  if (classification === "blocked") {
    const [log] = await db.insert(autonomyLogTable).values({
      action,
      actionType: "blocked",
      parameters,
      outcome: "blocked",
      reason: "Action is in blocked list or not in allowed list",
    }).returning();

    bus.emit({ source: "autonomy-controller", target: null, type: "system.error", payload: { event: "autonomy.action_blocked", action, safetyLevel: config.safetyLevel } });

    res.status(403).json({ status: "blocked", reason: "Action not permitted under current safety settings", log: formatLog(log) });
    return;
  }

  if (classification === "requires_confirmation") {
    const [log] = await db.insert(autonomyLogTable).values({
      action,
      actionType: "requires_confirmation",
      parameters,
      outcome: "pending",
      reason: `Safety level '${config.safetyLevel}' requires confirmation`,
    }).returning();

    bus.emit({ source: "autonomy-controller", target: null, type: "system.heartbeat", payload: { event: "autonomy.action_pending_confirmation", action, logId: log.id } });

    res.json({ status: "pending_confirmation", reason: "Action requires user confirmation", logId: log.id, log: formatLog(log) });
    return;
  }

  const { outcome, result } = simulateExecution(action, parameters as Record<string, unknown>);
  const [log] = await db.insert(autonomyLogTable).values({
    action,
    actionType: "allowed",
    parameters,
    outcome,
    reason: result,
  }).returning();

  bus.emit({ source: "autonomy-controller", target: null, type: "plugin.executed", payload: { event: "autonomy.action_executed", action, outcome, requestedBy } });

  res.json({ status: "executed", outcome, result, log: formatLog(log) });
});

router.get("/autonomy/log", async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit as string ?? "50"), 200);
  const logs = await db.select().from(autonomyLogTable).orderBy(desc(autonomyLogTable.createdAt)).limit(limit);
  res.json({ logs: logs.map(formatLog), total: logs.length });
});

export default router;
