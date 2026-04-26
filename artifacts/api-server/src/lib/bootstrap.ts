import { bus } from "./bus.js";
import { PluginRegistry } from "./plugin-registry.js";
import { memoryService } from "./memory-service.js";
import { runInference, refreshOllamaDetection } from "./inference.js";
import { logger } from "./logger.js";
import { presenceManager } from "./presence-manager.js";
import { initiativeEngine } from "./initiative-engine.js";
import { narrativeManager } from "./narrative-manager.js";

export let registry: PluginRegistry;

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

  logger.info("EventBus and PluginRegistry bootstrapped");
}

export async function teardown(): Promise<void> {
  if (registry) {
    await registry.shutdownAll();
  }
  memoryService.stop();
  presenceManager.stop();
  initiativeEngine.stop();
  bus.emit({
    source: "system",
    target: null,
    type: "system.shutdown",
    payload: { stoppedAt: new Date().toISOString() },
  });
}
