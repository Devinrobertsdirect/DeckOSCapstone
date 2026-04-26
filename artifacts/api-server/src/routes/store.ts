import { Router } from "express";
import { readFileSync, mkdirSync, writeFileSync } from "fs";
import { fileURLToPath } from "url";
import path from "path";
import { z } from "zod";
import { db, communityPluginsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { bus } from "../lib/bus.js";
import { logger } from "../lib/logger.js";

const router = Router();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

interface RegistryPlugin {
  id: string;
  name: string;
  author: string;
  description: string;
  version: string;
  category: string;
  permissions: string[];
  tags: string[];
  iconUrl: string | null;
  entrypointUrl: string | null;
  installCount: number;
  readme: string;
}

interface Registry {
  version: string;
  updatedAt: string;
  plugins: RegistryPlugin[];
}

let registryCache: Registry | null = null;
let cacheExpiresAt = 0;
const CACHE_TTL_MS = 5 * 60 * 1000;

async function fetchRegistry(): Promise<Registry> {
  if (registryCache && Date.now() < cacheExpiresAt) {
    return registryCache;
  }

  const registryUrl = process.env.PLUGIN_REGISTRY_URL;

  if (registryUrl) {
    const res = await fetch(registryUrl, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error(`Registry fetch failed: ${res.status}`);
    const data = (await res.json()) as Registry;
    registryCache = data;
    cacheExpiresAt = Date.now() + CACHE_TTL_MS;
    return data;
  }

  const localPath = path.resolve(__dirname, "../registry.json");
  const raw = readFileSync(localPath, "utf-8");
  const data = JSON.parse(raw) as Registry;
  registryCache = data;
  cacheExpiresAt = Date.now() + CACHE_TTL_MS;
  return data;
}

const COMMUNITY_PLUGINS_DIR = path.resolve(process.cwd(), "community-plugins");

async function downloadAndLoadPlugin(entry: RegistryPlugin): Promise<void> {
  if (!entry.entrypointUrl) {
    logger.info({ pluginId: entry.id }, "Store: no entrypointUrl — skipping runtime load");
    return;
  }

  let pluginFile: string;
  try {
    const res = await fetch(entry.entrypointUrl, { signal: AbortSignal.timeout(15_000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    pluginFile = await res.text();
  } catch (err) {
    logger.warn({ err, pluginId: entry.id, url: entry.entrypointUrl }, "Store: failed to download plugin entrypoint — installed in DB only");
    return;
  }

  try {
    mkdirSync(COMMUNITY_PLUGINS_DIR, { recursive: true });
    const localPath = path.join(COMMUNITY_PLUGINS_DIR, `${entry.id}.mjs`);
    writeFileSync(localPath, pluginFile, "utf-8");

    const { registry } = await import("../lib/bootstrap.js");
    if (registry) {
      await registry.loadPlugin(localPath);
      logger.info({ pluginId: entry.id, localPath }, "Store: community plugin loaded into runtime");
    }
  } catch (err) {
    logger.warn({ err, pluginId: entry.id }, "Store: runtime load failed — installed in DB only");
  }
}

router.get("/plugins/store/registry", async (_req, res) => {
  try {
    const registry = await fetchRegistry();
    const installed = await db.select().from(communityPluginsTable);
    const installedIds = new Set(installed.map((p) => p.pluginId));

    const plugins = registry.plugins.map((p) => {
      const row = installed.find((i) => i.pluginId === p.id);
      return {
        ...p,
        installed: installedIds.has(p.id),
        enabled: row?.enabled ?? false,
        installedAt: row?.installedAt?.toISOString() ?? null,
      };
    });

    res.json({ version: registry.version, updatedAt: registry.updatedAt, plugins });
  } catch (err) {
    logger.error({ err }, "Failed to fetch plugin registry");
    res.status(500).json({ error: "Failed to load plugin registry" });
  }
});

const InstallBody = z.object({ force: z.boolean().optional().default(false) });

router.post("/plugins/store/install/:pluginId", async (req, res) => {
  const { pluginId } = req.params;

  const parsed = InstallBody.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body" });
    return;
  }

  let storeRegistry: Registry;
  try {
    storeRegistry = await fetchRegistry();
  } catch (err) {
    logger.error({ err }, "Registry unavailable during install");
    res.status(503).json({ error: "Registry unavailable" });
    return;
  }

  const entry = storeRegistry.plugins.find((p) => p.id === pluginId);
  if (!entry) {
    res.status(404).json({ error: `Plugin '${pluginId}' not found in registry` });
    return;
  }

  const existing = await db
    .select()
    .from(communityPluginsTable)
    .where(eq(communityPluginsTable.pluginId, pluginId))
    .limit(1);

  if (existing.length > 0 && !parsed.data.force) {
    res.status(409).json({ error: "Plugin already installed", pluginId });
    return;
  }

  try {
    if (existing.length > 0) {
      await db
        .update(communityPluginsTable)
        .set({
          name: entry.name,
          author: entry.author,
          description: entry.description,
          version: entry.version,
          category: entry.category,
          permissions: entry.permissions,
          entrypointUrl: entry.entrypointUrl,
          iconUrl: entry.iconUrl,
          tags: entry.tags,
          installCount: entry.installCount,
          enabled: true,
        })
        .where(eq(communityPluginsTable.pluginId, pluginId));
    } else {
      await db.insert(communityPluginsTable).values({
        pluginId: entry.id,
        name: entry.name,
        author: entry.author,
        description: entry.description,
        version: entry.version,
        category: entry.category,
        permissions: entry.permissions,
        entrypointUrl: entry.entrypointUrl,
        iconUrl: entry.iconUrl,
        tags: entry.tags,
        installCount: entry.installCount,
        enabled: true,
      });
    }

    bus.emit({
      source: "store",
      target: null,
      type: "plugin.installed",
      payload: { pluginId, name: entry.name, version: entry.version },
    });

    downloadAndLoadPlugin(entry).catch((err) =>
      logger.warn({ err, pluginId }, "Store: background runtime load failed"),
    );

    logger.info({ pluginId, version: entry.version }, "Community plugin installed");
    res.json({ pluginId, installed: true, version: entry.version });
  } catch (err) {
    logger.error({ err, pluginId }, "Failed to install community plugin");
    res.status(500).json({ error: "Install failed" });
  }
});

router.delete("/plugins/store/uninstall/:pluginId", async (req, res) => {
  const { pluginId } = req.params;

  const existing = await db
    .select()
    .from(communityPluginsTable)
    .where(eq(communityPluginsTable.pluginId, pluginId))
    .limit(1);

  if (existing.length === 0) {
    res.status(404).json({ error: `Plugin '${pluginId}' is not installed` });
    return;
  }

  await db.delete(communityPluginsTable).where(eq(communityPluginsTable.pluginId, pluginId));

  const { registry } = await import("../lib/bootstrap.js");
  if (registry) {
    await registry.unloadPlugin(pluginId).catch((err) =>
      logger.warn({ err, pluginId }, "Store: runtime unload failed — removed from DB"),
    );
  }

  bus.emit({
    source: "store",
    target: null,
    type: "plugin.uninstalled",
    payload: { pluginId },
  });

  logger.info({ pluginId }, "Community plugin uninstalled");
  res.json({ pluginId, uninstalled: true });
});

router.patch("/plugins/store/:pluginId/toggle", async (req, res) => {
  const { pluginId } = req.params;

  const bodyParsed = z.object({ enabled: z.boolean() }).safeParse(req.body);
  if (!bodyParsed.success) {
    res.status(400).json({ error: "Body must include { enabled: boolean }" });
    return;
  }

  const { enabled } = bodyParsed.data;

  const existing = await db
    .select()
    .from(communityPluginsTable)
    .where(eq(communityPluginsTable.pluginId, pluginId))
    .limit(1);

  if (existing.length === 0) {
    res.status(404).json({ error: `Plugin '${pluginId}' is not installed` });
    return;
  }

  await db
    .update(communityPluginsTable)
    .set({ enabled })
    .where(eq(communityPluginsTable.pluginId, pluginId));

  const { registry } = await import("../lib/bootstrap.js");
  if (registry) {
    registry.setEnabled(pluginId, enabled);
  }

  bus.emit({
    source: "store",
    target: null,
    type: "plugin.status_changed",
    payload: { pluginId, enabled },
  });

  res.json({ pluginId, enabled });
});

router.get("/plugins/store/installed", async (_req, res) => {
  const installed = await db
    .select()
    .from(communityPluginsTable)
    .orderBy(communityPluginsTable.installedAt);

  res.json({ plugins: installed, count: installed.length });
});

export default router;
