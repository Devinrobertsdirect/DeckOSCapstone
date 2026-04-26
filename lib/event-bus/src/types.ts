import { z } from "zod";

export const EventCategorySchema = z.enum([
  "system",
  "plugin",
  "device",
  "ai",
  "memory",
  "client",
]);

export type EventCategory = z.infer<typeof EventCategorySchema>;

export const SystemEventTypeSchema = z.enum([
  "system.boot",
  "system.shutdown",
  "system.error",
  "system.heartbeat",
  "system.config_changed",
  "system.monitor.metrics",
  "system.monitor.request",
  "system.cognitive_tick",
  "system.maintenance",
]);

export const PluginEventTypeSchema = z.enum([
  "plugin.loaded",
  "plugin.unloaded",
  "plugin.error",
  "plugin.executed",
  "plugin.status_changed",
  "plugin.list.request",
  "plugin.list.response",
  "plugin.toggle.request",
]);

export const DeviceEventTypeSchema = z.enum([
  "device.connected",
  "device.disconnected",
  "device.reading",
  "device.command_sent",
  "device.command.send",
  "device.state.changed",
  "device.error",
  "device.list.request",
  "device.list.response",
  "device.registry.snapshot",
  "device.location.updated",
  "device.geofence.triggered",
  "device.status.updated",
  "device.discovery.new",
  "device.discovery.initialized",
]);

export const AiEventTypeSchema = z.enum([
  "ai.inference_started",
  "ai.inference_completed",
  "ai.model_changed",
  "ai.mode.set",
  "ai.router.status",
  "ai.error",
  "ai.chat.request",
  "ai.chat.token",
  "ai.chat.response",
]);

export const MemoryEventTypeSchema = z.enum([
  "memory.stored",
  "memory.retrieved",
  "memory.deleted",
  "memory.expired",
  "memory.search.request",
  "memory.search.response",
  "memory.recent.request",
  "memory.recent.response",
  "memory.ucm_enriched",
]);

export const AutonomyEventTypeSchema = z.enum([
  "autonomy.action.request",
  "autonomy.action.executed",
  "autonomy.action.blocked",
  "autonomy.action.skipped",
  "autonomy.confirmation.required",
  "prediction.generated",
  "goal.created",
  "goal.completed",
  "goal.stale",
  "routine.triggered",
  "routine.completed",
  "briefing.generated",
]);

export const ClientEventTypeSchema = z.enum([
  "client.connected",
  "client.disconnected",
]);

export const NotificationEventTypeSchema = z.enum([
  "notification.created",
]);

export const EventTypeSchema = z.union([
  SystemEventTypeSchema,
  PluginEventTypeSchema,
  DeviceEventTypeSchema,
  AiEventTypeSchema,
  MemoryEventTypeSchema,
  AutonomyEventTypeSchema,
  ClientEventTypeSchema,
  NotificationEventTypeSchema,
]);

export type EventType = z.infer<typeof EventTypeSchema>;

export const BusEventSchema = z.object({
  id: z.string(),
  version: z.literal("v1"),
  source: z.string(),
  target: z.string().nullable(),
  type: EventTypeSchema,
  payload: z.unknown(),
  timestamp: z.string(),
});

export type BusEvent = z.infer<typeof BusEventSchema>;

export type EventHandler = (event: BusEvent) => Promise<void> | void;

export type EventFilter = {
  type?: string;
  source?: string;
  limit?: number;
  offset?: number;
};
