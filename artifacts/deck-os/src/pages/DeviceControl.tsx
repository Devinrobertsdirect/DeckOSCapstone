import { useState, useEffect, useMemo } from "react";
import { Network, Cpu, Thermometer, Wifi, Monitor, Zap, AlertTriangle, CheckCircle2, Moon, Send, Sparkles, BookOpen } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useWebSocket, useWsEvents } from "@/contexts/WebSocketContext";
import { useQuery } from "@tanstack/react-query";

interface DeviceProfile {
  deviceId:     string;
  displayName:  string;
  icon:         string;
  description:  string;
  protocol:     string;
  deviceType:   string;
  capabilities: string[];
  eventSchema:  Record<string, unknown>;
  controlStubs: { action: string; label: string; description: string; params: Record<string, string>; example?: string }[];
  initialized:  boolean;
}

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

type DeviceReading = {
  sensor?: string;
  value?: unknown;
  unit?: string;
};

type Device = {
  id: string;
  name: string;
  type?: string;
  category?: string;
  protocol?: string;
  status?: string;
  lastSeen?: string;
  location?: string;
  capabilities?: string[];
  readings?: DeviceReading[];
};

type DeviceListPayload = { devices?: Device[]; count?: number };
type DeviceReadingPayload = { deviceId?: string; readings?: DeviceReading[]; status?: string; newStatus?: string };
type DeviceConnPayload = { deviceId?: string; status?: string; newStatus?: string };

export default function DeviceControl() {
  const { sendEvent } = useWebSocket();
  const [selectedDevice, setSelectedDevice] = useState<string | null>(null);
  const [action, setAction] = useState("");
  const [controlLog, setControlLog] = useState<Array<{ deviceId: string; action: string; timestamp: string }>>([]);

  const { data: profilesData } = useQuery<{ profiles: DeviceProfile[] }>({
    queryKey: ["device-profiles"],
    queryFn:  () => fetch(`${import.meta.env.BASE_URL}api/devices/profiles`).then(r => r.json()),
    refetchInterval: 30_000,
  });
  const profiles = profilesData?.profiles ?? [];
  const profileMap = Object.fromEntries(profiles.map(p => [p.deviceId, p]));

  const deviceListEvents = useWsEvents((e) => e.type === "device.registry.snapshot");
  const readingEvents = useWsEvents((e) => e.type === "device.reading");
  const connEvents = useWsEvents((e) => e.type === "device.connected" || e.type === "device.disconnected");
  const stateChangedEvents = useWsEvents((e) => e.type === "device.state.changed");
  const commandEvents = useWsEvents((e) => e.type === "device.command.send" || e.type === "device.command_sent");

  useEffect(() => {
    sendEvent({ type: "device.list.request", payload: {} });
  }, [sendEvent]);

  const baseDevices: Device[] = useMemo(() => {
    const latest = deviceListEvents.at(-1);
    if (!latest) return [];
    return ((latest.payload as DeviceListPayload).devices ?? []);
  }, [deviceListEvents]);

  const devices = useMemo(() => {
    return baseDevices.map((d) => {
      const latestReading = readingEvents
        .filter((e) => (e.payload as DeviceReadingPayload).deviceId === d.id)
        .at(-1);
      const latestConn = connEvents
        .filter((e) => (e.payload as DeviceConnPayload).deviceId === d.id)
        .at(-1);
      const latestStateChange = stateChangedEvents
        .filter((e) => (e.payload as DeviceConnPayload).deviceId === d.id)
        .at(-1);

      const statePayload = latestStateChange?.payload as DeviceReadingPayload | undefined;
      const status = statePayload?.newStatus ?? statePayload?.status
        ?? (latestConn
          ? (latestConn.type === "device.connected" ? "online" : "offline")
          : d.status ?? "offline");

      const readings = statePayload?.readings?.length
        ? statePayload.readings
        : latestReading
          ? ((latestReading.payload as DeviceReadingPayload).readings ?? d.readings ?? [])
          : d.readings ?? [];

      return { ...d, status, readings };
    });
  }, [baseDevices, readingEvents, connEvents, stateChangedEvents]);

  const selected = devices.find((d) => d.id === selectedDevice);

  const onlineCount = devices.filter((d) => d.status === "online").length;
  const offlineCount = devices.filter((d) => d.status === "offline").length;
  const errorCount = devices.filter((d) => d.status === "error").length;

  const handleControl = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDevice || !action.trim()) return;
    const act = action.trim();
    setAction("");
    setControlLog((prev) => [{ deviceId: selectedDevice, action: act, timestamp: new Date().toISOString() }, ...prev].slice(0, 30));
    sendEvent({
      type: "device.command.send",
      payload: { deviceId: selectedDevice, action: act, parameters: {} },
    });
  };

  const recentDeviceReadings = useMemo(() => {
    if (!selectedDevice) return [];
    return readingEvents
      .filter((e) => (e.payload as DeviceReadingPayload).deviceId === selectedDevice)
      .slice(-10)
      .reverse();
  }, [readingEvents, selectedDevice]);

  return (
    <div className="flex flex-col gap-6 h-full">
      <div className="flex items-center gap-2 font-mono text-xs text-primary/60 uppercase tracking-widest">
        <Network className="w-4 h-4 text-primary" />
        <span>DEVICE.CONTROL // IOT ABSTRACTION LAYER</span>
      </div>

      {devices.length > 0 && (
        <div className="grid grid-cols-4 gap-4">
          <div className="border border-primary/20 bg-card/40 p-3 font-mono text-center">
            <div className="text-2xl text-primary font-bold">{devices.length}</div>
            <div className="text-xs text-muted-foreground">TOTAL</div>
          </div>
          <div className="border border-[#22ff44]/30 bg-card/40 p-3 font-mono text-center">
            <div className="text-2xl text-[#22ff44] font-bold">{onlineCount}</div>
            <div className="text-xs text-muted-foreground">ONLINE</div>
          </div>
          <div className="border border-[#ff3333]/30 bg-card/40 p-3 font-mono text-center">
            <div className="text-2xl text-[#ff3333] font-bold">{offlineCount}</div>
            <div className="text-xs text-muted-foreground">OFFLINE</div>
          </div>
          <div className="border border-[#ff6600]/30 bg-card/40 p-3 font-mono text-center">
            <div className="text-2xl text-[#ff6600] font-bold">{errorCount}</div>
            <div className="text-xs text-muted-foreground">ERROR</div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 flex-1 min-h-0">
        <div className="col-span-2 overflow-y-auto space-y-3">
          {devices.length === 0 && (
            <div className="font-mono text-xs text-primary/30 p-4 border border-primary/10 text-center">
              // Waiting for device.registry.snapshot from EventBus...
            </div>
          )}
          {devices.map((device) => {
            const StatusIcon = STATUS_ICONS[device.status ?? "offline"] ?? AlertTriangle;
            const TypeIcon = TYPE_ICONS[device.type ?? "simulated"] ?? Cpu;
            const isSelected = selectedDevice === device.id;
            const isActuator = device.type === "actuator" || device.capabilities?.includes("toggle");
            const profile  = profileMap[device.id];

            const recentReadings = readingEvents
              .filter((e) => (e.payload as DeviceReadingPayload).deviceId === device.id)
              .slice(-5);

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
                      <TypeIcon className={`w-4 h-4 ${TYPE_COLORS[device.type ?? "simulated"] ?? "text-primary"}`} />
                    </div>
                    <div>
                      <div className="text-sm text-primary font-bold flex items-center gap-2">
                        {profile?.displayName ?? device.name}
                        {profile?.initialized && (
                          <span className="flex items-center gap-1 text-[9px] bg-emerald-500/15 text-emerald-400 border border-emerald-500/25 rounded px-1.5 py-0.5 uppercase tracking-wider font-bold">
                            <Sparkles className="w-2.5 h-2.5" /> PROFILED
                          </span>
                        )}
                        {!profile && device.protocol !== "simulated" && (
                          <span className="flex items-center gap-1 text-[9px] bg-amber-500/15 text-amber-400 border border-amber-500/25 rounded px-1.5 py-0.5 uppercase tracking-wider font-bold">
                            UNINITIALIZED
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        [{(device.type ?? "device").toUpperCase()}] // {(device.protocol ?? "WS").toUpperCase()}
                        {device.location && ` // ${device.location}`}
                      </div>
                      {profile?.description && (
                        <div className="text-[10px] text-primary/30 mt-0.5 leading-snug max-w-xs">{profile.description}</div>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {isActuator && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          sendEvent({
                            type: "device.command.send",
                            payload: { deviceId: device.id, action: "toggle", parameters: {} },
                          });
                        }}
                        className="border border-[#ffaa00]/40 text-[#ffaa00] px-2 py-1 text-xs hover:bg-[#ffaa00]/10 transition-all"
                      >
                        TOGGLE
                      </button>
                    )}
                    <div className={`text-xs flex items-center gap-1 ${STATUS_COLORS[device.status ?? "offline"] ?? "text-muted-foreground"}`}>
                      <StatusIcon className="w-3 h-3" />
                      {(device.status ?? "offline").toUpperCase()}
                    </div>
                  </div>
                </div>

                {device.readings && device.readings.length > 0 && (
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-2">
                    {device.readings.map((r, ri) => (
                      <div key={ri} className="border border-primary/10 bg-background/50 p-2 text-center">
                        <div className="text-xs text-muted-foreground uppercase">{(r.sensor ?? "").replace(/_/g, " ")}</div>
                        <div className="text-sm text-primary font-bold">
                          {typeof r.value === "boolean" ? (r.value ? "ON" : "OFF") : String(r.value ?? "---")}
                          {r.unit && <span className="text-xs text-muted-foreground ml-1">{r.unit}</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {recentReadings.length > 1 && (
                  <div className="flex gap-0.5 h-8 items-end mt-1">
                    {recentReadings.map((re, ri) => {
                      const p = re.payload as DeviceReadingPayload;
                      const r = p.readings?.[0];
                      const v = typeof r?.value === "number" ? r.value : 0;
                      const pct = Math.min(100, Math.max(5, v));
                      return (
                        <div
                          key={ri}
                          className="flex-1 bg-primary/20 rounded-sm"
                          style={{ height: `${pct}%` }}
                        />
                      );
                    })}
                  </div>
                )}

                {device.capabilities && device.capabilities.length > 0 && (
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
            {selected && (() => {
              const sp = profileMap[selected.id];
              if (sp?.initialized) return (
                <div className="mb-3 space-y-3">
                  <div className="flex items-center gap-2 text-emerald-400/70 text-[10px]">
                    <Sparkles className="w-3 h-3" />
                    <span className="uppercase tracking-wider">Profile: {sp.displayName}</span>
                  </div>
                  {sp.description && (
                    <div className="text-primary/30 leading-relaxed">{sp.description}</div>
                  )}
                  {sp.controlStubs.length > 0 && (
                    <div>
                      <div className="text-primary/40 mb-1.5 flex items-center gap-1.5"><BookOpen className="w-2.5 h-2.5" /> CONTROL STUBS:</div>
                      <div className="space-y-1.5">
                        {sp.controlStubs.map(stub => (
                          <button
                            key={stub.action}
                            onClick={() => {
                              sendEvent({ type: "device.command.send", payload: { deviceId: selected.id, action: stub.action, parameters: {} } });
                            }}
                            className="w-full text-left flex items-start gap-2 border border-primary/15 hover:border-primary/40 bg-primary/5 hover:bg-primary/10 px-2.5 py-2 rounded transition-all"
                          >
                            <span className="bg-primary/20 text-primary font-bold rounded px-1.5 py-0.5 text-[9px] uppercase shrink-0">{stub.label}</span>
                            <span className="text-primary/50 text-[10px]">{stub.description}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
              return (
                <div className="mb-3 text-primary/40 space-y-1">
                  <div>CAPABILITIES:</div>
                  {(selected.capabilities ?? []).map((c) => <div key={c} className="pl-2 text-primary/60">// {c}</div>)}
                  {(selected.capabilities ?? []).length === 0 && <div className="pl-2 text-primary/20">none listed</div>}
                </div>
              );
            })()}
            {selected && recentDeviceReadings.length > 0 && (
              <div className="mb-3">
                <div className="text-primary/40 mb-1">RECENT READINGS:</div>
                {recentDeviceReadings.slice(0, 5).map((re, i) => (
                  <div key={i} className="text-primary/50 flex justify-between">
                    <span>reading</span>
                    <span>{new Date(re.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</span>
                  </div>
                ))}
              </div>
            )}
            {controlLog.map((log, i) => (
              <div key={i} className="border border-primary/20 p-2">
                <div className="text-primary/40 mb-1">&gt; [{log.deviceId}] {log.action}</div>
                <div className="text-primary/60 text-xs">{new Date(log.timestamp).toLocaleTimeString()}</div>
              </div>
            ))}
            {commandEvents.slice(-5).reverse().map((e, i) => (
              <div key={i} className="border border-[#22ff44]/20 p-2">
                <div className="text-[#22ff44]/60">&gt; device.command.send</div>
                <div className="text-primary/40 text-xs">{JSON.stringify(e.payload).slice(0, 80)}</div>
              </div>
            ))}
            {controlLog.length === 0 && commandEvents.length === 0 && (
              <div className="text-primary/30">// Select a device and send a command</div>
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
              placeholder={selected ? `Action (on, off, read, toggle...)` : "Select a device first"}
            />
            <button
              type="submit"
              data-testid="device-control-submit"
              disabled={!selected}
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
