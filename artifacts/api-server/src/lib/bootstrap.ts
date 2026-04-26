import { bus } from "./bus.js";
import { PluginRegistry } from "./plugin-registry.js";
import { memoryService } from "./memory-service.js";
import { runInference, refreshOllamaDetection, getInferenceState } from "./inference.js";
import { logger } from "./logger.js";
import { presenceManager } from "./presence-manager.js";
import { initiativeEngine } from "./initiative-engine.js";
import { narrativeManager } from "./narrative-manager.js";
import { createDeviceManager, type DeviceManager } from "./device-manager.js";
import { MqttTransport } from "./mqtt-transport.js";
import { WsDeviceTransport } from "./ws-device-transport.js";
import { startSimulatedDevices } from "./simulated-devices.js";
import type { BusEvent } from "@workspace/event-bus";

export let registry: PluginRegistry;

let mqttTransport: MqttTransport | null = null;
let wsDeviceTransport: WsDeviceTransport | null = null;
let stopSimDevices: (() => void) | null = null;
let routerStatusTimer: NodeJS.Timeout | null = null;
let currentAiMode = "DIRECT_EXECUTION";

function emitRouterStatus(): void {
  const state = getInferenceState();
  const totalReqs = state.totalRequests;
  const cacheHitRate = totalReqs > 0 ? state.cacheHits / totalReqs : 0;
  bus.emit({
    source: "ai-router",
    target: null,
    type: "ai.router.status",
    payload: {
      mode: currentAiMode,
      ollamaAvailable: state.ollamaAvailable ?? false,
      cloudAvailable: false,
      totalRequests: totalReqs,
      cacheHitRate: parseFloat(cacheHitRate.toFixed(4)),
      lastDetectedAt: state.lastDetected.toISOString(),
      timestamp: new Date().toISOString(),
    },
  });
}

function registerQueryHandlers(deviceManager: DeviceManager): void {
  bus.subscribe("device.list.request", async (event: BusEvent) => {
    if (event.type !== "device.list.request") return;
    const devices = deviceManager.listDevices().map((d) => ({
      id: d.id,
      name: d.name,
      type: d.type,
      category: d.category,
      protocol: d.protocol,
      status: d.state.status,
      readings: d.state.readings,
      lastSeen: d.state.lastSeen,
      location: d.location,
      capabilities: d.capabilities,
    }));
    bus.emit({
      source: "device-manager",
      target: event.source,
      type: "device.registry.snapshot",
      payload: { devices, count: devices.length },
    });
  });

  bus.subscribe("plugin.list.request", (event: BusEvent) => {
    if (event.type !== "plugin.list.request") return;
    const plugins = registry
      ? registry.listPlugins().map((p) => ({
          id: p.plugin.id,
          name: p.plugin.name,
          version: p.plugin.version,
          enabled: p.enabled,
          status: p.status,
        }))
      : [];
    bus.emit({
      source: "plugin-registry",
      target: event.source,
      type: "plugin.list.response",
      payload: { plugins, count: plugins.length },
    });
  });

  bus.subscribe("memory.search.request", async (event: BusEvent) => {
    if (event.type !== "memory.search.request") return;
    const p = event.payload as Record<string, unknown>;
    const query = String(p?.["query"] ?? "");
    if (!query) return;
    const results = await memoryService.search(query, 10);
    bus.emit({
      source: "memory-service",
      target: event.source,
      type: "memory.search.response",
      payload: { query, results, count: results.length },
    });
  });

  bus.subscribe("memory.recent.request", async (event: BusEvent) => {
    if (event.type !== "memory.recent.request") return;
    const p = event.payload as Record<string, unknown>;
    const limit = typeof p?.["limit"] === "number" ? p["limit"] : 20;
    const entries = await memoryService.getRecent(limit);
    bus.emit({
      source: "memory-service",
      target: event.source,
      type: "memory.recent.response",
      payload: { entries, count: entries.length },
    });
  });

  bus.subscribe("ai.mode.set", (event: BusEvent) => {
    if (event.type !== "ai.mode.set") return;
    const p = event.payload as Record<string, unknown>;
    const mode = String(p?.["mode"] ?? currentAiMode);
    currentAiMode = mode;
    emitRouterStatus();
  });

  bus.subscribe("plugin.toggle.request", (event: BusEvent) => {
    if (event.type !== "plugin.toggle.request") return;
    const p = event.payload as Record<string, unknown>;
    const pluginId = String(p?.["pluginId"] ?? "");
    const enabled = Boolean(p?.["enabled"] ?? false);
    if (!pluginId) return;
    registry.setEnabled(pluginId, enabled);
  });
}

export async function bootstrap(): Promise<void> {
  memoryService.start(60_000);
  presenceManager.start(30_000);
  initiativeEngine.start(60_000);

  setTimeout(() => void narrativeManager.syncFromGoals(), 10_000);

  registry = new PluginRegistry(bus, {
    memory: memoryService,
    infer: async (opts) => {
      const result = await runInference(opts);
      return result;
    },
  });

  bus.emit({
    source: "system",
    target: null,
    type: "system.boot",
    payload: { startedAt: new Date().toISOString() },
  });

  await refreshOllamaDetection().catch(() => {});

  await registry.loadPluginsDir();

  const deviceManager = createDeviceManager(bus);

  registerQueryHandlers(deviceManager);

  stopSimDevices = startSimulatedDevices(deviceManager);

  routerStatusTimer = setInterval(emitRouterStatus, 10_000);
  setTimeout(emitRouterStatus, 2_000);

  mqttTransport = new MqttTransport(bus, deviceManager);
  await mqttTransport.start();

  const wsDevicePort = Number(process.env["WS_DEVICE_PORT"] ?? 0);
  if (wsDevicePort > 0) {
    try {
      wsDeviceTransport = new WsDeviceTransport(wsDevicePort, bus, deviceManager);
    } catch (err) {
      logger.warn({ err }, "WsDeviceTransport: failed to start — continuing without WS device transport");
    }
  } else {
    logger.info("WsDeviceTransport: WS_DEVICE_PORT not set — WS device transport disabled");
  }

  logger.info("EventBus, PluginRegistry, DeviceManager, and transports bootstrapped");
}

export async function teardown(): Promise<void> {
  if (routerStatusTimer) {
    clearInterval(routerStatusTimer);
    routerStatusTimer = null;
  }
  if (registry) {
    await registry.shutdownAll();
  }
  memoryService.stop();
  presenceManager.stop();
  initiativeEngine.stop();

  if (stopSimDevices) {
    stopSimDevices();
  }

  if (mqttTransport) {
    await mqttTransport.stop();
  }

  if (wsDeviceTransport) {
    wsDeviceTransport.stop();
  }

  bus.emit({
    source: "system",
    target: null,
    type: "system.shutdown",
    payload: { stoppedAt: new Date().toISOString() },
  });
}
