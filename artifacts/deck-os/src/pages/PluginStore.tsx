import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Store, Download, Trash2, Power, Search, Filter,
  CheckCircle2, Shield, Tag, User, Globe, Loader2, RefreshCw,
} from "lucide-react";

const API_BASE = "/api";

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
  installed: boolean;
  enabled: boolean;
  installedAt: string | null;
}

type StoreTab = "store" | "installed";

const CATEGORY_COLORS: Record<string, string> = {
  monitoring: "text-[#00d4ff]",
  ai: "text-[#cc44ff]",
  iot: "text-[#ffaa00]",
  productivity: "text-[#22ff44]",
  community: "text-primary/60",
};

const PERMISSION_LABELS: Record<string, { label: string; risk: "low" | "medium" | "high" }> = {
  network: { label: "Network access", risk: "medium" },
  ai_inference: { label: "AI inference", risk: "low" },
  memory_read: { label: "Read memory", risk: "low" },
  memory_write: { label: "Write memory", risk: "medium" },
  device_control: { label: "Device control", risk: "high" },
  device_read: { label: "Read devices", risk: "low" },
  system_stats: { label: "System stats", risk: "low" },
  process_list: { label: "Process list", risk: "low" },
  tts: { label: "Voice output (TTS)", risk: "low" },
  notifications: { label: "Send notifications", risk: "low" },
};

const PERM_RISK_COLORS: Record<string, string> = {
  low: "border-[#22ff44]/30 text-[#22ff44]/70",
  medium: "border-[#ffaa00]/30 text-[#ffaa00]/70",
  high: "border-[#ff3333]/40 text-[#ff3333]/70",
};

async function fetchRegistry() {
  const res = await fetch(`${API_BASE}/plugins/store/registry`);
  if (!res.ok) throw new Error(`${res.status}`);
  return res.json() as Promise<{ plugins: RegistryPlugin[]; version: string; updatedAt: string }>;
}

export default function PluginStore() {
  const [tab, setTab] = useState<StoreTab>("store");
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [confirmUninstall, setConfirmUninstall] = useState<string | null>(null);
  const [replaceMode, setReplaceMode] = useState(false);
  const qc = useQueryClient();

  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ["plugin-store-registry"],
    queryFn: fetchRegistry,
    staleTime: 2 * 60 * 1000,
  });

  const installMut = useMutation({
    mutationFn: async ({ pluginId, force }: { pluginId: string; force?: boolean }) => {
      const res = await fetch(`${API_BASE}/plugins/store/install/${pluginId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ force }),
      });
      if (!res.ok) {
        const t = await res.text();
        throw new Error(t);
      }
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["plugin-store-registry"] }),
  });

  const uninstallMut = useMutation({
    mutationFn: async (pluginId: string) => {
      const res = await fetch(`${API_BASE}/plugins/store/uninstall/${pluginId}`, { method: "DELETE" });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: () => {
      setConfirmUninstall(null);
      qc.invalidateQueries({ queryKey: ["plugin-store-registry"] });
    },
  });

  const toggleMut = useMutation({
    mutationFn: async ({ pluginId, enabled }: { pluginId: string; enabled: boolean }) => {
      const res = await fetch(`${API_BASE}/plugins/store/${pluginId}/toggle`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled }),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["plugin-store-registry"] }),
  });

  const allPlugins = data?.plugins ?? [];
  const categories = ["all", ...new Set(allPlugins.map((p) => p.category))];

  const visiblePlugins = allPlugins.filter((p) => {
    const matchesTab = tab === "store" ? true : p.installed;
    const matchesSearch =
      !search ||
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.description.toLowerCase().includes(search.toLowerCase()) ||
      p.tags.some((t) => t.toLowerCase().includes(search.toLowerCase()));
    const matchesCat = categoryFilter === "all" || p.category === categoryFilter;
    return matchesTab && matchesSearch && matchesCat;
  });

  const installedCount = allPlugins.filter((p) => p.installed).length;

  return (
    <div className="flex flex-col gap-4 h-full">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 font-mono text-xs text-primary/60 uppercase tracking-widest">
          <Store className="w-4 h-4 text-primary" />
          <span>PLUGIN.STORE // COMMUNITY REGISTRY</span>
        </div>
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="flex items-center gap-1 font-mono text-xs text-primary/40 hover:text-primary border border-primary/20 hover:border-primary/40 px-2 py-1 transition-all disabled:opacity-40"
        >
          <RefreshCw className={`w-3 h-3 ${isFetching ? "animate-spin" : ""}`} />
          REFRESH
        </button>
      </div>

      {/* Tab bar */}
      <div className="flex gap-0 border border-primary/20 w-fit font-mono text-xs">
        {(["store", "installed"] as StoreTab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-1.5 transition-all ${
              tab === t
                ? "bg-primary/10 text-primary border-r border-primary/20"
                : "text-primary/40 hover:text-primary/70 border-r border-primary/10 last:border-r-0"
            }`}
          >
            {t === "store" ? "STORE" : `MY PLUGINS (${installedCount})`}
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-1.5 border border-primary/20 px-2 py-1 flex-1 min-w-40">
          <Search className="w-3 h-3 text-primary/40" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="search plugins..."
            className="bg-transparent font-mono text-xs text-primary placeholder:text-primary/30 outline-none flex-1"
          />
        </div>
        <div className="flex items-center gap-1.5 border border-primary/20 px-2 py-1">
          <Filter className="w-3 h-3 text-primary/40" />
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="bg-transparent font-mono text-xs text-primary outline-none"
          >
            {categories.map((c) => (
              <option key={c} value={c} className="bg-background">
                {c.toUpperCase()}
              </option>
            ))}
          </select>
        </div>
        {tab === "store" && (
          <label className="flex items-center gap-1.5 font-mono text-[10px] text-primary/40 cursor-pointer">
            <input
              type="checkbox"
              checked={replaceMode}
              onChange={(e) => setReplaceMode(e.target.checked)}
              className="accent-primary w-3 h-3"
            />
            RE-INSTALL
          </label>
        )}
      </div>

      {/* Content */}
      {isLoading && (
        <div className="flex items-center justify-center flex-1 font-mono text-xs text-primary/30">
          <Loader2 className="w-4 h-4 animate-spin mr-2" />
          Loading registry...
        </div>
      )}

      {error && (
        <div className="border border-[#ff3333]/30 p-4 font-mono text-xs text-[#ff3333]/70">
          // Registry unavailable: {(error as Error).message}
        </div>
      )}

      {!isLoading && !error && visiblePlugins.length === 0 && (
        <div className="font-mono text-xs text-primary/30 border border-primary/10 p-4 text-center">
          {tab === "installed" ? "// No plugins installed yet" : "// No plugins match your search"}
        </div>
      )}

      {!isLoading && !error && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 overflow-y-auto flex-1 content-start">
          {visiblePlugins.map((plugin) => {
            const catColor = CATEGORY_COLORS[plugin.category] ?? "text-primary/60";
            const isInstalling = installMut.isPending && installMut.variables?.pluginId === plugin.id;
            const isUninstalling = uninstallMut.isPending && uninstallMut.variables === plugin.id;
            const isOfficial = plugin.author.startsWith("deck-os/official");
            const highRiskPerms = plugin.permissions.filter(
              (p) => (PERMISSION_LABELS[p]?.risk ?? "low") === "high"
            );

            return (
              <div
                key={plugin.id}
                className={`border ${plugin.installed ? "border-primary/40 shadow-[0_0_10px_rgba(0,212,255,0.1)]" : "border-primary/20"} p-4 flex flex-col gap-3 bg-card/30 relative`}
              >
                {/* Installed badge */}
                {plugin.installed && (
                  <div className="absolute top-3 right-3 flex items-center gap-1 font-mono text-[10px] text-[#22ff44] border border-[#22ff44]/30 px-1.5 py-0.5">
                    <CheckCircle2 className="w-2.5 h-2.5" />
                    INSTALLED
                  </div>
                )}

                {/* Plugin header */}
                <div className="pr-20">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm text-primary font-bold">{plugin.name}</span>
                    {isOfficial && (
                      <span className="font-mono text-[9px] text-[#00d4ff] border border-[#00d4ff]/30 px-1">OFFICIAL</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className={`font-mono text-[10px] ${catColor}`}>
                      [{plugin.category.toUpperCase()}]
                    </span>
                    <span className="font-mono text-[10px] text-primary/30">v{plugin.version}</span>
                  </div>
                </div>

                {/* Description */}
                <p className="font-mono text-xs text-muted-foreground leading-relaxed">
                  {plugin.description}
                </p>

                {/* Meta row */}
                <div className="flex items-center gap-3 font-mono text-[10px] text-primary/40">
                  <span className="flex items-center gap-1">
                    <User className="w-2.5 h-2.5" />
                    {plugin.author}
                  </span>
                  <span className="flex items-center gap-1">
                    <Download className="w-2.5 h-2.5" />
                    {plugin.installCount.toLocaleString()}
                  </span>
                  {plugin.entrypointUrl && (
                    <span className="flex items-center gap-1">
                      <Globe className="w-2.5 h-2.5" />
                      remote
                    </span>
                  )}
                </div>

                {/* Tags */}
                {plugin.tags.length > 0 && (
                  <div className="flex items-center gap-1 flex-wrap">
                    <Tag className="w-2.5 h-2.5 text-primary/30" />
                    {plugin.tags.filter((t) => t !== "official").map((tag) => (
                      <span
                        key={tag}
                        className="font-mono text-[9px] text-primary/40 border border-primary/15 px-1 py-0.5"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                )}

                {/* Permissions */}
                {plugin.permissions.length > 0 && (
                  <div>
                    <div className="flex items-center gap-1 font-mono text-[9px] text-primary/30 mb-1">
                      <Shield className="w-2.5 h-2.5" />
                      PERMISSIONS
                      {highRiskPerms.length > 0 && (
                        <span className="text-[#ff3333]/60 ml-1">• {highRiskPerms.length} high-risk</span>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {plugin.permissions.map((perm) => {
                        const info = PERMISSION_LABELS[perm];
                        const risk = info?.risk ?? "low";
                        return (
                          <span
                            key={perm}
                            className={`font-mono text-[9px] border px-1.5 py-0.5 ${PERM_RISK_COLORS[risk]}`}
                            title={`Risk: ${risk}`}
                          >
                            {info?.label ?? perm}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Actions */}
                <div className="flex items-center gap-2 mt-auto pt-2 border-t border-primary/10">
                  {!plugin.installed ? (
                    <button
                      onClick={() => installMut.mutate({ pluginId: plugin.id, force: replaceMode })}
                      disabled={isInstalling}
                      className="flex items-center gap-1 font-mono text-xs text-primary/60 hover:text-primary border border-primary/30 hover:border-primary/60 px-3 py-1.5 transition-all disabled:opacity-40"
                    >
                      {isInstalling ? <Loader2 className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3" />}
                      {isInstalling ? "INSTALLING..." : "INSTALL"}
                    </button>
                  ) : (
                    <>
                      {/* Enable/Disable toggle (for non-official installed plugins) */}
                      {!isOfficial && (
                        <button
                          onClick={() => toggleMut.mutate({ pluginId: plugin.id, enabled: !plugin.enabled })}
                          disabled={toggleMut.isPending}
                          className={`flex items-center gap-1 font-mono text-xs border px-3 py-1.5 transition-all disabled:opacity-40 ${
                            plugin.enabled
                              ? "text-primary/60 hover:text-primary border-primary/30 hover:border-primary/60"
                              : "text-primary/30 hover:text-primary/60 border-primary/15 hover:border-primary/30"
                          }`}
                        >
                          <Power className="w-3 h-3" />
                          {plugin.enabled ? "DISABLE" : "ENABLE"}
                        </button>
                      )}

                      {/* Uninstall (with confirmation) */}
                      {!isOfficial && (
                        confirmUninstall === plugin.id ? (
                          <div className="flex items-center gap-1">
                            <span className="font-mono text-[10px] text-[#ff3333]/70">Confirm?</span>
                            <button
                              onClick={() => uninstallMut.mutate(plugin.id)}
                              disabled={isUninstalling}
                              className="font-mono text-[10px] text-[#ff3333] border border-[#ff3333]/40 px-2 py-1 hover:bg-[#ff3333]/10 transition-all"
                            >
                              {isUninstalling ? <Loader2 className="w-3 h-3 animate-spin inline" /> : "YES"}
                            </button>
                            <button
                              onClick={() => setConfirmUninstall(null)}
                              className="font-mono text-[10px] text-primary/40 border border-primary/20 px-2 py-1 hover:text-primary transition-all"
                            >
                              NO
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setConfirmUninstall(plugin.id)}
                            className="flex items-center gap-1 font-mono text-xs text-[#ff3333]/40 hover:text-[#ff3333] border border-[#ff3333]/20 hover:border-[#ff3333]/40 px-3 py-1.5 transition-all"
                          >
                            <Trash2 className="w-3 h-3" />
                            UNINSTALL
                          </button>
                        )
                      )}

                      {/* Official plugins just show installed state */}
                      {isOfficial && (
                        <span className="font-mono text-[10px] text-primary/30">// built-in — cannot be removed</span>
                      )}
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Registry footer */}
      {data && (
        <div className="border-t border-primary/10 pt-2 font-mono text-[10px] text-primary/25 flex items-center justify-between">
          <span>registry v{data.version} · updated {data.updatedAt}</span>
          <span>
            {allPlugins.length} plugins · {installedCount} installed
          </span>
        </div>
      )}
    </div>
  );
}
