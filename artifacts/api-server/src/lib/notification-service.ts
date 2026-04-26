/**
 * Notification Service
 * Subscribes to relevant bus events and persists them as notifications in the DB.
 * Emits notification.created on the bus so the WS layer forwards them to frontends.
 */
import { db, notificationsTable } from "@workspace/db";
import { eq, desc, or } from "drizzle-orm";
import { bus } from "./bus.js";
import { logger } from "./logger.js";
import type { BusEvent } from "@workspace/event-bus";

type Severity = "info" | "warning" | "critical";

interface NotificationSpec {
  type: string;
  severity: Severity;
  title: string;
  message: string;
  metadata?: Record<string, unknown>;
}

class NotificationService {
  private subIds: string[] = [];

  async createNotification(spec: NotificationSpec): Promise<void> {
    try {
      const [row] = await db.insert(notificationsTable).values({
        type:     spec.type,
        severity: spec.severity,
        title:    spec.title,
        message:  spec.message,
        metadata: spec.metadata ?? {},
      }).returning();

      bus.emit({
        source: "notification-service",
        target: null,
        type:   "notification.created",
        payload: {
          id:        row!.id,
          type:      row!.type,
          severity:  row!.severity,
          title:     row!.title,
          message:   row!.message,
          read:      row!.read,
          metadata:  row!.metadata,
          createdAt: row!.createdAt.toISOString(),
        },
      });
    } catch (err) {
      logger.warn({ err }, "NotificationService: failed to create notification");
    }
  }

  async markRead(id: number): Promise<boolean> {
    const result = await db.update(notificationsTable)
      .set({ read: true })
      .where(eq(notificationsTable.id, id))
      .returning({ id: notificationsTable.id });
    return result.length > 0;
  }

  async markAllRead(): Promise<void> {
    await db.update(notificationsTable)
      .set({ read: true })
      .where(eq(notificationsTable.read, false));
  }

  async clearAll(): Promise<void> {
    await db.delete(notificationsTable);
  }

  async list(limit = 50): Promise<typeof notificationsTable.$inferSelect[]> {
    return db.select().from(notificationsTable)
      .orderBy(desc(notificationsTable.createdAt))
      .limit(limit);
  }

  async unreadCount(): Promise<number> {
    const rows = await db.select({ id: notificationsTable.id })
      .from(notificationsTable)
      .where(eq(notificationsTable.read, false));
    return rows.length;
  }

  start(): void {
    // device.disconnected → warning
    this.subIds.push(bus.subscribe("device.disconnected", async (e: BusEvent) => {
      if (e.type !== "device.disconnected") return;
      const p = e.payload as Record<string, unknown>;
      const deviceId = String(p["deviceId"] ?? p["id"] ?? "unknown");
      await this.createNotification({
        type:     "device.disconnected",
        severity: "warning",
        title:    "Device Disconnected",
        message:  `Device "${deviceId}" has left the network.`,
        metadata: p,
      });
    }));

    // device.geofence.triggered → warning
    this.subIds.push(bus.subscribe("device.geofence.triggered", async (e: BusEvent) => {
      if (e.type !== "device.geofence.triggered") return;
      const p = e.payload as Record<string, unknown>;
      const deviceId = String(p["deviceId"] ?? "unknown");
      const zone     = String(p["zone"] ?? p["geofence"] ?? "unknown zone");
      await this.createNotification({
        type:     "device.geofence.triggered",
        severity: "warning",
        title:    "Geofence Alert",
        message:  `Device "${deviceId}" triggered geofence: ${zone}.`,
        metadata: p,
      });
    }));

    // autonomy.confirmation.required → critical
    this.subIds.push(bus.subscribe("autonomy.confirmation.required", async (e: BusEvent) => {
      if (e.type !== "autonomy.confirmation.required") return;
      const p = e.payload as Record<string, unknown>;
      const action = String(p["action"] ?? "unknown action");
      await this.createNotification({
        type:     "autonomy.confirmation.required",
        severity: "critical",
        title:    "Action Requires Confirmation",
        message:  `JARVIS needs your approval to: ${action}.`,
        metadata: p,
      });
    }));

    // goal.stale → info
    this.subIds.push(bus.subscribe("goal.stale", async (e: BusEvent) => {
      if (e.type !== "goal.stale") return;
      const p = e.payload as Record<string, unknown>;
      const title = String(p["title"] ?? p["goalTitle"] ?? "a goal");
      await this.createNotification({
        type:     "goal.stale",
        severity: "info",
        title:    "Goal Going Stale",
        message:  `"${title}" hasn't progressed recently and may need attention.`,
        metadata: p,
      });
    }));

    // routine.completed → info
    this.subIds.push(bus.subscribe("routine.completed", async (e: BusEvent) => {
      if (e.type !== "routine.completed") return;
      const p = e.payload as Record<string, unknown>;
      const name    = String(p["routineName"] ?? p["name"] ?? "A routine");
      const outcome = String(p["outcome"] ?? "completed");
      await this.createNotification({
        type:     "routine.completed",
        severity: outcome === "failure" ? "warning" : "info",
        title:    `Routine ${outcome === "failure" ? "Failed" : "Completed"}`,
        message:  `"${name}" finished with outcome: ${outcome}.`,
        metadata: p,
      });
    }));

    // system.error → critical
    this.subIds.push(bus.subscribe("system.error", async (e: BusEvent) => {
      if (e.type !== "system.error") return;
      const p = e.payload as Record<string, unknown>;
      const msg = String(p["message"] ?? p["error"] ?? "An unexpected error occurred.");
      await this.createNotification({
        type:     "system.error",
        severity: "critical",
        title:    "System Error",
        message:  msg,
        metadata: p,
      });
    }));

    logger.info({ subscriptions: this.subIds.length }, "NotificationService started");
  }

  stop(): void {
    for (const id of this.subIds) bus.unsubscribe(id);
    this.subIds = [];
  }
}

export const notificationService = new NotificationService();
