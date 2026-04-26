import path from "path";
import { fileURLToPath } from "url";
import { readdir, access } from "fs/promises";
import type { EventBus, BusEvent, EventType, EventHandler } from "@workspace/event-bus";
import { isValidPlugin } from "@workspace/event-bus";
import type { Plugin, PluginContext } from "@workspace/event-bus";
import { logger } from "./logger.js";
import type { PluginMemory } from "@workspace/event-bus";
import type { InferOptions, InferResult } from "@workspace/event-bus";

type PluginEntry = {
  plugin: Plugin;
  enabled: boolean;
  status: "active" | "inactive" | "error" | "loading";
  errorMessage?: string;
  lastActivity?: Date;
};

export class PluginRegistry {
  private plugins = new Map<string, PluginEntry>();
  private bus: EventBus;
  private memory: PluginMemory | undefined;
  private inferFn: ((opts: InferOptions) => Promise<InferResult>) | undefined;

  constructor(bus: EventBus, opts?: { memory?: PluginMemory; infer?: (opts: InferOptions) => Promise<InferResult> }) {
    this.bus = bus;
    this.memory = opts?.memory;
    this.inferFn = opts?.infer;
  }

  async loadPluginsDir(): Promise<void> {
    const __dirname = fileURLToPath(new URL(".", import.meta.url));
    const candidateDirs = [
      path.resolve(__dirname, "plugins"),
      path.resolve(__dirname, "..", "plugins"),
      path.resolve(process.cwd(), "dist", "plugins"),
    ];

    let pluginsDir: string | undefined;
    for (const candidate of candidateDirs) {
      try {
        await access(candidate);
        pluginsDir = candidate;
        break;
      } catch {
        // try next
      }
    }

    if (!pluginsDir) {
      logger.warn({ candidateDirs }, "No plugins directory found — skipping plugin load");
      return;
    }

    logger.info({ pluginsDir }, "PluginRegistry: using plugins directory");

    let files: string[];
    try {
      files = await readdir(pluginsDir);
    } catch {
      logger.warn({ pluginsDir }, "Plugins directory not found or unreadable — skipping plugin load");
      return;
    }

    const pluginFiles = files.filter(
      (f) => (f.endsWith(".js") || f.endsWith(".mjs")) && !f.startsWith("_"),
    );

    for (const file of pluginFiles) {
      const fullPath = path.resolve(pluginsDir, file);
      await this.loadPlugin(fullPath);
    }
  }

  async loadPlugin(filePath: string): Promise<void> {
    let mod: unknown;
    try {
      mod = await import(filePath);
    } catch (err) {
      logger.error({ err, filePath }, "PluginRegistry: failed to import plugin file");
      return;
    }

    const exported = (mod as Record<string, unknown>)["default"] ?? mod;
    let instance: unknown;

    if (typeof exported === "function") {
      try {
        instance = new (exported as new () => unknown)();
      } catch (err) {
        logger.error({ err, filePath }, "PluginRegistry: failed to instantiate plugin");
        return;
      }
    } else {
      instance = exported;
    }

    if (!isValidPlugin(instance)) {
      logger.error(
        { filePath },
        "PluginRegistry: plugin does not implement required interface (init, on_event, execute, shutdown)",
      );
      return;
    }

    const plugin = instance;
    const entry: PluginEntry = { plugin, enabled: true, status: "loading" };
    this.plugins.set(plugin.id, entry);

    const context = this.buildContext(plugin);
    try {
      await plugin.init(context);
      entry.status = "active";
      entry.lastActivity = new Date();
      logger.info({ pluginId: plugin.id, name: plugin.name }, "PluginRegistry: plugin loaded successfully");
      this.bus.emit({
        source: "plugin-registry",
        target: null,
        type: "plugin.loaded",
        payload: { pluginId: plugin.id, name: plugin.name, version: plugin.version },
      });
    } catch (err) {
      entry.status = "error";
      entry.errorMessage = String(err);
      logger.error({ err, pluginId: plugin.id }, "PluginRegistry: plugin init failed");
      this.bus.emit({
        source: "plugin-registry",
        target: null,
        type: "plugin.error",
        payload: { pluginId: plugin.id, error: String(err) },
      });
    }
  }

  private buildContext(plugin: Plugin): PluginContext {
    return {
      emit: (event) => {
        this.plugins.get(plugin.id)!.lastActivity = new Date();
        this.bus.emit(event);
      },
      subscribe: (type: EventType | string, handler: EventHandler): string => {
        const wrappedHandler: EventHandler = async (event: BusEvent) => {
          const entry = this.plugins.get(plugin.id);
          if (!entry || !entry.enabled) return;
          try {
            await handler(event);
            entry.lastActivity = new Date();
          } catch (err) {
            entry.status = "error";
            entry.errorMessage = String(err);
            logger.error({ err, pluginId: plugin.id, eventType: event.type }, "Plugin on_event error");
          }
        };
        return this.bus.subscribe(type, wrappedHandler);
      },
      logger: {
        info: (msg, data) => logger.info({ pluginId: plugin.id, data }, msg),
        warn: (msg, data) => logger.warn({ pluginId: plugin.id, data }, msg),
        error: (msg, data) => logger.error({ pluginId: plugin.id, data }, msg),
      },
      memory: this.memory,
      infer: this.inferFn,
    };
  }

  async shutdownAll(): Promise<void> {
    for (const [id, entry] of this.plugins) {
      try {
        await entry.plugin.shutdown();
        logger.info({ pluginId: id }, "PluginRegistry: plugin shutdown");
        this.bus.emit({
          source: "plugin-registry",
          target: null,
          type: "plugin.unloaded",
          payload: { pluginId: id },
        });
      } catch (err) {
        logger.error({ err, pluginId: id }, "PluginRegistry: plugin shutdown error");
      }
    }
    this.plugins.clear();
  }

  getPlugin(id: string): PluginEntry | undefined {
    return this.plugins.get(id);
  }

  listPlugins(): PluginEntry[] {
    return Array.from(this.plugins.values());
  }

  setEnabled(id: string, enabled: boolean): boolean {
    const entry = this.plugins.get(id);
    if (!entry) return false;
    entry.enabled = enabled;
    entry.status = enabled ? "active" : "inactive";
    this.bus.emit({
      source: "plugin-registry",
      target: null,
      type: "plugin.status_changed",
      payload: { pluginId: id, enabled },
    });
    return true;
  }

  async unloadPlugin(id: string): Promise<boolean> {
    const entry = this.plugins.get(id);
    if (!entry) return false;
    try {
      await entry.plugin.shutdown();
    } catch (err) {
      logger.error({ err, pluginId: id }, "PluginRegistry: shutdown error during unload");
    }
    this.plugins.delete(id);
    this.bus.emit({
      source: "plugin-registry",
      target: null,
      type: "plugin.unloaded",
      payload: { pluginId: id },
    });
    logger.info({ pluginId: id }, "PluginRegistry: plugin unloaded");
    return true;
  }
}
