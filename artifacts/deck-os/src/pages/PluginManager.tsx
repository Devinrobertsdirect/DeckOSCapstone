import { useState } from "react";
import {
  useListPlugins, getListPluginsQueryKey,
  useTogglePlugin,
  useExecutePluginCommand,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Settings, Play, Power, ChevronRight, Loader2, CheckCircle2, XCircle, AlertTriangle } from "lucide-react";

const STATUS_COLORS: Record<string, string> = {
  active: "text-[#22ff44]",
  inactive: "text-muted-foreground",
  error: "text-[#ff3333]",
  loading: "text-[#ffaa00]",
};

const CATEGORY_COLORS: Record<string, string> = {
  monitoring: "text-[#00d4ff]",
  system: "text-[#22ff44]",
  ai: "text-[#cc44ff]",
  iot: "text-[#ffaa00]",
  automation: "text-muted-foreground",
};

export default function PluginManager() {
  const [selectedPlugin, setSelectedPlugin] = useState<string | null>(null);
  const [command, setCommand] = useState("");
  const [commandOutput, setCommandOutput] = useState<Array<{ plugin: string; command: string; output: string; success: boolean; ms: number }>>([]);
  const qc = useQueryClient();

  const { data } = useListPlugins({ query: { queryKey: getListPluginsQueryKey(), refetchInterval: 5000 } });
  const toggle = useTogglePlugin();
  const execute = useExecutePluginCommand();

  const handleToggle = (pluginId: string, currentEnabled: boolean) => {
    toggle.mutate({ pluginId, data: { enabled: !currentEnabled } }, {
      onSuccess: () => qc.invalidateQueries({ queryKey: getListPluginsQueryKey() }),
    });
  };

  const handleExecute = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPlugin || !command.trim()) return;
    const parts = command.trim().split(/\s+/);
    const cmd = parts[0];
    const cmdCopy = command;
    setCommand("");
    execute.mutate({ pluginId: selectedPlugin, data: { command: cmd } }, {
      onSuccess: (res) => {
        setCommandOutput((prev) => [{ plugin: selectedPlugin, command: cmdCopy, output: res.output, success: res.success, ms: res.executionTimeMs }, ...prev].slice(0, 30));
      },
    });
  };

  const plugins = data?.plugins ?? [];
  const selected = plugins.find((p) => p.id === selectedPlugin);

  return (
    <div className="flex flex-col gap-6 h-full">
      <div className="flex items-center gap-2 font-mono text-xs text-primary/60 uppercase tracking-widest">
        <Settings className="w-4 h-4 text-primary" />
        <span>PLUGIN.MANAGER // SKILLS SYSTEM</span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 flex-1 min-h-0">
        <div className="col-span-2 grid grid-cols-1 md:grid-cols-2 gap-4 content-start">
          {plugins.map((plugin) => {
            const isSelected = selectedPlugin === plugin.id;
            const statusColor = STATUS_COLORS[plugin.status] ?? "text-muted-foreground";
            return (
              <Card
                key={plugin.id}
                data-testid={`plugin-card-${plugin.id}`}
                onClick={() => setSelectedPlugin(isSelected ? null : plugin.id)}
                className={`bg-card/40 rounded-none cursor-pointer transition-all
                  ${isSelected ? "border-primary shadow-[0_0_15px_rgba(0,212,255,0.2)]" : "border-primary/20 hover:border-primary/50"}`}
              >
                <CardHeader className="p-4 border-b border-primary/10">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="font-mono text-sm text-primary font-bold">{plugin.name}</div>
                      <div className={`font-mono text-xs ${CATEGORY_COLORS[plugin.category] ?? "text-muted-foreground"}`}>
                        [{plugin.category.toUpperCase()}] v{plugin.version}
                      </div>
                    </div>
                    <button
                      data-testid={`toggle-${plugin.id}`}
                      onClick={(e) => { e.stopPropagation(); handleToggle(plugin.id, plugin.enabled); }}
                      className={`p-1.5 border transition-all ${plugin.enabled ? "border-primary/40 text-primary hover:bg-primary/10" : "border-primary/20 text-primary/30 hover:text-primary/60"}`}
                    >
                      <Power className="w-3 h-3" />
                    </button>
                  </div>
                </CardHeader>
                <CardContent className="p-4 space-y-3">
                  <p className="font-mono text-xs text-muted-foreground">{plugin.description}</p>
                  <div className="flex items-center justify-between">
                    <div className={`font-mono text-xs flex items-center gap-1 ${statusColor}`}>
                      {plugin.status === "active" ? <CheckCircle2 className="w-3 h-3" /> : plugin.status === "error" ? <AlertTriangle className="w-3 h-3" /> : <Power className="w-3 h-3" />}
                      {plugin.status.toUpperCase()}
                    </div>
                    {isSelected && <ChevronRight className="w-4 h-4 text-primary" />}
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {plugin.commands.slice(0, 4).map((cmd) => (
                      <span key={cmd} className="font-mono text-xs border border-primary/20 px-1.5 py-0.5 text-primary/60">{cmd}</span>
                    ))}
                    {plugin.commands.length > 4 && (
                      <span className="font-mono text-xs text-primary/40">+{plugin.commands.length - 4}</span>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        <Card className="bg-card/40 border-primary/20 rounded-none flex flex-col min-h-0">
          <CardHeader className="border-b border-primary/20 p-4">
            <CardTitle className="font-mono text-sm text-primary">
              {selected ? `EXEC // ${selected.id.toUpperCase()}` : "SELECT A PLUGIN"}
            </CardTitle>
          </CardHeader>
          <div className="flex-1 overflow-y-auto p-4 space-y-2 font-mono text-xs min-h-0">
            {selected && (
              <div className="mb-3 text-primary/40">
                <div>AVAILABLE CMDS:</div>
                {selected.commands.map((c) => (
                  <div key={c} className="pl-2 text-primary/60">// {c}</div>
                ))}
              </div>
            )}
            {commandOutput.map((o, i) => (
              <div key={i} className={`border p-2 ${o.success ? "border-primary/20" : "border-[#ff3333]/30"}`}>
                <div className="flex justify-between text-primary/40 mb-1">
                  <span>&gt; [{o.plugin}] {o.command}</span>
                  <span className="flex gap-2">
                    {o.success ? <CheckCircle2 className="w-3 h-3 text-[#22ff44]" /> : <XCircle className="w-3 h-3 text-[#ff3333]" />}
                    {o.ms}ms
                  </span>
                </div>
                <div className="text-primary/80">{o.output}</div>
              </div>
            ))}
            {execute.isPending && (
              <div className="flex items-center gap-2 text-primary/60">
                <Loader2 className="w-3 h-3 animate-spin" />
                <span>Executing...</span>
              </div>
            )}
          </div>
          <form onSubmit={handleExecute} className="border-t border-primary/20 p-4 flex gap-2">
            <span className="text-primary font-mono mt-2 text-sm">&gt;</span>
            <Input
              data-testid="plugin-cmd-input"
              value={command}
              onChange={(e) => setCommand(e.target.value)}
              disabled={!selected}
              className="font-mono border-none bg-transparent focus-visible:ring-0 text-primary px-0 disabled:opacity-40"
              placeholder={selected ? `Command for ${selected.id}...` : "Select a plugin first"}
            />
            <button
              type="submit"
              data-testid="plugin-cmd-submit"
              disabled={!selected || execute.isPending}
              className="border border-primary/40 px-3 font-mono text-xs text-primary hover:bg-primary/10 transition-all disabled:opacity-40"
            >
              <Play className="w-3 h-3" />
            </button>
          </form>
        </Card>
      </div>
    </div>
  );
}
