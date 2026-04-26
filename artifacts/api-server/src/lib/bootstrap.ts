import { bus } from "./bus.js";
import { PluginRegistry } from "./plugin-registry.js";
import { logger } from "./logger.js";

export let registry: PluginRegistry;

export async function bootstrap(): Promise<void> {
  registry = new PluginRegistry(bus);

  bus.emit({
    source: "system",
    target: null,
    type: "system.boot",
    payload: { startedAt: new Date().toISOString() },
  });

  await registry.loadPluginsDir();

  logger.info("EventBus and PluginRegistry bootstrapped");
}

export async function teardown(): Promise<void> {
  if (registry) {
    await registry.shutdownAll();
  }
  bus.emit({
    source: "system",
    target: null,
    type: "system.shutdown",
    payload: { stoppedAt: new Date().toISOString() },
  });
}
