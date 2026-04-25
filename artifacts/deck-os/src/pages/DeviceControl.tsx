import { useState } from "react";
import {
  useListDevices, getListDevicesQueryKey,
  useGetDeviceStats, getGetDeviceStatsQueryKey,
  useControlDevice,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Network, Cpu, Thermometer, Wifi, Monitor, Zap, AlertTriangle, CheckCircle2, Moon, Loader2, Send } from "lucide-react";

const STATUS_COLORS: Record<string, string> = {
  online: "text-[#22ff44]",
  offline: "text-[#ff3333]",
  error: "text-[#ff6600]",
  standby: "text-[#ffaa00]",
};

const STATUS_ICONS: Record<string, React.ElementType> = {
  online: CheckCircle2,
  offline: AlertTriangle,
  error: AlertTriangle,
  standby: Moon,
};

const TYPE_ICONS: Record<string, React.ElementType> = {
  sensor: Thermometer,
  actuator: Zap,
  display: Monitor,
  network: Wifi,
  simulated: Cpu,
};

const TYPE_COLORS: Record<string, string> = {
  sensor: "text-[#00d4ff]",
  actuator: "text-[#ffaa00]",
  display: "text-[#cc44ff]",
  network: "text-[#22ff44]",
  simulated: "text-muted-foreground",
};

export default function DeviceControl() {
  const [selectedDevice, setSelectedDevice] = useState<string | null>(null);
  const [action, setAction] = useState("");
  const [controlLog, setControlLog] = useState<Array<{ deviceId: string; action: string; message: string; success: boolean }>>([]);
  const qc = useQueryClient();

  const { data } = useListDevices({ query: { queryKey: getListDevicesQueryKey(), refetchInterval: 3000 } });
  const { data: stats } = useGetDeviceStats({ query: { queryKey: getGetDeviceStatsQueryKey(), refetchInterval: 5000 } });
  const control = useControlDevice();

  const handleControl = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDevice || !action.trim()) return;
    const act = action;
    setAction("");
    control.mutate({ deviceId: selectedDevice, data: { action: act } }, {
      onSuccess: (res) => {
        setControlLog((prev) => [{ deviceId: selectedDevice, action: act, message: res.message, success: res.success }, ...prev].slice(0, 30));
        qc.invalidateQueries({ queryKey: getListDevicesQueryKey() });
      },
    });
  };

  const devices = data?.devices ?? [];
  const selected = devices.find((d) => d.id === selectedDevice);

  return (
    <div className="flex flex-col gap-6 h-full">
      <div className="flex items-center gap-2 font-mono text-xs text-primary/60 uppercase tracking-widest">
        <Network className="w-4 h-4 text-primary" />
        <span>DEVICE.CONTROL // IOT ABSTRACTION LAYER</span>
      </div>

      {stats && (
        <div className="grid grid-cols-4 gap-4">
          <div className="border border-primary/20 bg-card/40 p-3 font-mono text-center">
            <div className="text-2xl text-primary font-bold">{stats.total}</div>
            <div className="text-xs text-muted-foreground">TOTAL</div>
          </div>
          <div className="border border-[#22ff44]/30 bg-card/40 p-3 font-mono text-center">
            <div className="text-2xl text-[#22ff44] font-bold">{stats.online}</div>
            <div className="text-xs text-muted-foreground">ONLINE</div>
          </div>
          <div className="border border-[#ff3333]/30 bg-card/40 p-3 font-mono text-center">
            <div className="text-2xl text-[#ff3333] font-bold">{stats.offline}</div>
            <div className="text-xs text-muted-foreground">OFFLINE</div>
          </div>
          <div className="border border-[#ff6600]/30 bg-card/40 p-3 font-mono text-center">
            <div className="text-2xl text-[#ff6600] font-bold">{stats.error}</div>
            <div className="text-xs text-muted-foreground">ERROR</div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 flex-1 min-h-0">
        <div className="col-span-2 overflow-y-auto space-y-3">
          {devices.map((device) => {
            const StatusIcon = STATUS_ICONS[device.status] ?? AlertTriangle;
            const TypeIcon = TYPE_ICONS[device.type] ?? Cpu;
            const isSelected = selectedDevice === device.id;
            return (
              <div
                key={device.id}
                data-testid={`device-${device.id}`}
                onClick={() => setSelectedDevice(isSelected ? null : device.id)}
                className={`border bg-card/40 p-4 cursor-pointer transition-all font-mono
                  ${isSelected ? "border-primary shadow-[0_0_15px_rgba(0,212,255,0.15)]" : "border-primary/20 hover:border-primary/50"}`}
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className={`p-2 border ${isSelected ? "border-primary bg-primary/10" : "border-primary/20"}`}>
                      <TypeIcon className={`w-4 h-4 ${TYPE_COLORS[device.type] ?? "text-primary"}`} />
                    </div>
                    <div>
                      <div className="text-sm text-primary font-bold">{device.name}</div>
                      <div className="text-xs text-muted-foreground">
                        [{device.type.toUpperCase()}] // {device.protocol.toUpperCase()}
                        {device.location && ` // ${device.location}`}
                      </div>
                    </div>
                  </div>
                  <div className={`text-xs flex items-center gap-1 ${STATUS_COLORS[device.status] ?? "text-muted-foreground"}`}>
                    <StatusIcon className="w-3 h-3" />
                    {device.status.toUpperCase()}
                  </div>
                </div>

                {device.readings.length > 0 && (
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                    {device.readings.map((r) => (
                      <div key={r.sensor} className="border border-primary/10 bg-background/50 p-2 text-center">
                        <div className="text-xs text-muted-foreground uppercase">{r.sensor.replace(/_/g, " ")}</div>
                        <div className="text-sm text-primary font-bold">
                          {typeof r.value === "boolean" ? (r.value ? "ON" : "OFF") : String(r.value)}
                          {r.unit && <span className="text-xs text-muted-foreground ml-1">{r.unit}</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {device.capabilities.length > 0 && (
                  <div className="flex gap-1 mt-2">
                    {device.capabilities.map((cap) => (
                      <span key={cap} className="text-xs border border-primary/20 px-1.5 py-0.5 text-primary/50">{cap}</span>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <Card className="bg-card/40 border-primary/20 rounded-none flex flex-col min-h-0">
          <CardHeader className="border-b border-primary/20 p-4">
            <CardTitle className="font-mono text-sm text-primary">
              {selected ? `CONTROL // ${selected.id.toUpperCase()}` : "DEVICE.CONTROL"}
            </CardTitle>
          </CardHeader>
          <div className="flex-1 overflow-y-auto p-4 space-y-2 font-mono text-xs min-h-0">
            {selected && (
              <div className="mb-3 text-primary/40 space-y-1">
                <div>CAPABILITIES:</div>
                {selected.capabilities.map((c) => <div key={c} className="pl-2 text-primary/60">// {c}</div>)}
              </div>
            )}
            {controlLog.map((log, i) => (
              <div key={i} className={`border p-2 ${log.success ? "border-primary/20" : "border-[#ff3333]/30"}`}>
                <div className="text-primary/40 mb-1">&gt; [{log.deviceId}] {log.action}</div>
                <div className={log.success ? "text-[#22ff44]" : "text-[#ff3333]"}>{log.message}</div>
              </div>
            ))}
            {control.isPending && (
              <div className="flex items-center gap-2 text-primary/60">
                <Loader2 className="w-3 h-3 animate-spin" />
                <span>Sending control signal...</span>
              </div>
            )}
          </div>
          <form onSubmit={handleControl} className="border-t border-primary/20 p-4 flex gap-2">
            <span className="text-primary font-mono mt-2 text-sm">&gt;</span>
            <Input
              data-testid="device-action-input"
              value={action}
              onChange={(e) => setAction(e.target.value)}
              disabled={!selected}
              className="font-mono border-none bg-transparent focus-visible:ring-0 text-primary px-0 disabled:opacity-40"
              placeholder={selected ? `Action (on, off, read...)` : "Select a device first"}
            />
            <button
              type="submit"
              data-testid="device-control-submit"
              disabled={!selected || control.isPending}
              className="border border-primary/40 px-3 font-mono text-xs text-primary hover:bg-primary/10 transition-all disabled:opacity-40"
            >
              <Send className="w-3 h-3" />
            </button>
          </form>
        </Card>
      </div>
    </div>
  );
}
