import { Router } from "express";
import { readFileSync } from "fs";
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

  let registry: Registry;
  try {
    registry = await fetchRegistry();
  } catch (err) {
    logger.error({ err }, "Registry unavailable during install");
    res.status(503).json({ error: "Registry unavailable" });
    return;
  }

  const entry = registry.plugins.find((p) => p.id === pluginId);
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
  const { enabled } = z.object({ enabled: z.boolean() }).parse(req.body);

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
