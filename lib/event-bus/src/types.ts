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
]);

export const PluginEventTypeSchema = z.enum([
  "plugin.loaded",
  "plugin.unloaded",
  "plugin.error",
  "plugin.executed",
  "plugin.status_changed",
  "plugin.list.request",
  "plugin.list.response",
]);

export const DeviceEventTypeSchema = z.enum([
  "device.connected",
  "device.disconnected",
  "device.reading",
  "device.command_sent",
  "device.error",
  "device.list.request",
  "device.list.response",
]);

export const AiEventTypeSchema = z.enum([
  "ai.inference_started",
  "ai.inference_completed",
  "ai.model_changed",
  "ai.error",
  "ai.chat.request",
  "ai.chat.response",
]);

export const MemoryEventTypeSchema = z.enum([
  "memory.stored",
  "memory.retrieved",
  "memory.deleted",
  "memory.expired",
  "memory.search.request",
]);

export const ClientEventTypeSchema = z.enum([
  "client.connected",
  "client.disconnected",
]);

export const EventTypeSchema = z.union([
  SystemEventTypeSchema,
  PluginEventTypeSchema,
  DeviceEventTypeSchema,
  AiEventTypeSchema,
  MemoryEventTypeSchema,
  ClientEventTypeSchema,
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
