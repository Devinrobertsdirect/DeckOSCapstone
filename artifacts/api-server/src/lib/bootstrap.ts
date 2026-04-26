import { bus } from "./bus.js";
import { PluginRegistry } from "./plugin-registry.js";
import { memoryService } from "./memory-service.js";
import { runInference, refreshOllamaDetection } from "./inference.js";
import { logger } from "./logger.js";
import { presenceManager } from "./presence-manager.js";
import { initiativeEngine } from "./initiative-engine.js";
import { narrativeManager } from "./narrative-manager.js";
import { createDeviceManager } from "./device-manager.js";
import { MqttTransport } from "./mqtt-transport.js";
import { WsDeviceTransport } from "./ws-device-transport.js";
import { startSimulatedDevices } from "./simulated-devices.js";

export let registry: PluginRegistry;

let mqttTransport: MqttTransport | null = null;
let wsDeviceTransport: WsDeviceTransport | null = null;
let stopSimDevices: (() => void) | null = null;

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

  stopSimDevices = startSimulatedDevices(deviceManager);

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
