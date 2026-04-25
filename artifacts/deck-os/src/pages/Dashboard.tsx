import { useState } from "react";
import { useGetSystemStats, getGetSystemStatsQueryKey, useGetSystemSummary, getGetSystemSummaryQueryKey, useGetAiRouterStatus, getGetAiRouterStatusQueryKey, useDispatchCommand } from "@workspace/api-client-react";
import { Terminal, Cpu, MemoryStick, Activity, Network } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

export default function Dashboard() {
  const [cmd, setCmd] = useState("");
  
  const { data: stats } = useGetSystemStats({ query: { queryKey: getGetSystemStatsQueryKey(), refetchInterval: 3000 }});
  const { data: summary } = useGetSystemSummary({ query: { queryKey: getGetSystemSummaryQueryKey(), refetchInterval: 3000 }});
  const { data: ai } = useGetAiRouterStatus({ query: { queryKey: getGetAiRouterStatusQueryKey(), refetchInterval: 5000 }});

  const dispatchCmd = useDispatchCommand();

  const handleCommand = (e: React.FormEvent) => {
    e.preventDefault();
    if (!cmd.trim()) return;
    dispatchCmd.mutate({ data: { input: cmd } });
    setCmd("");
  };

  return (
    <div className="flex flex-col h-full gap-6">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <MetricCard title="CPU.LOAD" value={`${stats?.cpu.usage.toFixed(1) || 0}%`} icon={Cpu} />
        <MetricCard title="MEM.USAGE" value={`${stats?.memory.percentage.toFixed(1) || 0}%`} icon={MemoryStick} />
        <MetricCard title="AI.MODE" value={ai?.mode || "UNKNOWN"} icon={Activity} highlight />
        <MetricCard title="PLUGINS.ACT" value={`${summary?.activePlugins || 0}/${summary?.totalPlugins || 0}`} icon={Network} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 flex-1 min-h-0">
        <Card className="col-span-2 bg-card/40 border-primary/20 rounded-none border">
          <CardHeader className="border-b border-primary/20 bg-primary/5 p-4">
            <CardTitle className="font-mono text-sm text-primary flex items-center gap-2">
              <Terminal className="w-4 h-4" /> MAIN.CONSOLE
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0 flex flex-col h-full">
            <div className="flex-1 p-4 font-mono text-sm overflow-y-auto text-primary/80">
              {/* placeholder output */}
              <div>&gt; System initialized...</div>
              <div>&gt; Loading AI models... OK</div>
              <div>&gt; Connecting plugins... OK</div>
            </div>
            <form onSubmit={handleCommand} className="p-4 border-t border-primary/20 flex gap-2">
              <span className="text-primary font-mono mt-2">&gt;</span>
              <Input 
                value={cmd}
                onChange={e => setCmd(e.target.value)}
                className="font-mono border-none bg-transparent focus-visible:ring-0 text-primary px-0" 
                placeholder="Enter command..."
              />
            </form>
          </CardContent>
        </Card>

        <Card className="bg-card/40 border-primary/20 rounded-none border">
          <CardHeader className="border-b border-primary/20 bg-primary/5 p-4">
            <CardTitle className="font-mono text-sm text-primary flex items-center gap-2">
              <Activity className="w-4 h-4" /> SYS.SUMMARY
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 font-mono text-sm space-y-4">
            <div className="flex justify-between">
              <span className="text-muted-foreground">STATUS:</span>
              <span className="text-[#00ff00]">{summary?.status || 'OPTIMAL'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">ALERTS:</span>
              <span className="text-[#ff0000]">{summary?.alertCount || 0}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">UPTIME:</span>
              <span className="text-primary">{summary?.uptimeSeconds || 0}s</span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function MetricCard({ title, value, icon: Icon, highlight = false }: { title: string, value: string | number, icon: any, highlight?: boolean }) {
  return (
    <Card className={`rounded-none border ${highlight ? 'border-[#ffcc00]/50 bg-[#ffcc00]/5' : 'border-primary/20 bg-primary/5'}`}>
      <CardContent className="p-6 flex flex-col justify-between h-full">
        <div className="flex justify-between items-start mb-4">
          <div className="text-xs font-mono text-muted-foreground tracking-wider">{title}</div>
          <Icon className={`w-5 h-5 ${highlight ? 'text-[#ffcc00]' : 'text-primary'}`} />
        </div>
        <div className={`text-3xl font-mono ${highlight ? 'text-[#ffcc00]' : 'text-primary'}`}>
          {value}
        </div>
      </CardContent>
    </Card>
  );
}
