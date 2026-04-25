import { Router } from "express";
import {
  ListDevicesResponse,
  GetDeviceParams,
  GetDeviceResponse,
  ControlDeviceParams,
  ControlDeviceBody,
  ControlDeviceResponse,
  GetDeviceStatsResponse,
} from "@workspace/api-zod";

const router = Router();

type DeviceStatus = "online" | "offline" | "error" | "standby";

interface DeviceReading {
  sensor: string;
  value: number | string | boolean;
  unit: string | null;
  timestamp: string;
}

interface Device {
  id: string;
  name: string;
  type: "sensor" | "actuator" | "display" | "network" | "simulated";
  status: DeviceStatus;
  protocol: "mqtt" | "websocket" | "http" | "simulated";
  readings: DeviceReading[];
  capabilities: string[];
  lastSeen: string | null;
  location: string | null;
}

function randomFloat(min: number, max: number, decimals = 1): number {
  return Math.round((Math.random() * (max - min) + min) * Math.pow(10, decimals)) / Math.pow(10, decimals);
}

function makeDevices(): Device[] {
  const now = new Date().toISOString();
  return [
    {
      id: "temp-sensor-01",
      name: "Temperature Sensor A1",
      type: "sensor",
      status: "online",
      protocol: "simulated",
      capabilities: ["read", "alert"],
      location: "Lab Bay 1",
      lastSeen: now,
      readings: [
        { sensor: "temperature", value: randomFloat(18, 35), unit: "°C", timestamp: now },
        { sensor: "humidity", value: randomFloat(40, 80), unit: "%", timestamp: now },
      ],
    },
    {
      id: "humidity-sensor-01",
      name: "Humidity Sensor B1",
      type: "sensor",
      status: "online",
      protocol: "simulated",
      capabilities: ["read"],
      location: "Lab Bay 2",
      lastSeen: now,
      readings: [
        { sensor: "humidity", value: randomFloat(35, 75), unit: "%", timestamp: now },
        { sensor: "dew_point", value: randomFloat(10, 25), unit: "°C", timestamp: now },
      ],
    },
    {
      id: "relay-controller-01",
      name: "Power Relay Array",
      type: "actuator",
      status: "online",
      protocol: "simulated",
      capabilities: ["on", "off", "toggle", "schedule"],
      location: "Control Panel",
      lastSeen: now,
      readings: [
        { sensor: "channel_1", value: true, unit: null, timestamp: now },
        { sensor: "channel_2", value: false, unit: null, timestamp: now },
        { sensor: "channel_3", value: true, unit: null, timestamp: now },
        { sensor: "power_draw", value: randomFloat(45, 150), unit: "W", timestamp: now },
      ],
    },
    {
      id: "oled-display-01",
      name: "OLED Status Display",
      type: "display",
      status: "standby",
      protocol: "simulated",
      capabilities: ["write", "clear", "brightness"],
      location: "Main Console",
      lastSeen: new Date(Date.now() - 300000).toISOString(),
      readings: [
        { sensor: "brightness", value: 80, unit: "%", timestamp: now },
        { sensor: "last_message", value: "DECK OS ONLINE", unit: null, timestamp: now },
      ],
    },
    {
      id: "network-probe-01",
      name: "Network Monitor",
      type: "network",
      status: "online",
      protocol: "simulated",
      capabilities: ["ping", "scan", "traffic"],
      location: "Network Rack",
      lastSeen: now,
      readings: [
        { sensor: "latency_ms", value: randomFloat(1, 15), unit: "ms", timestamp: now },
        { sensor: "packet_loss", value: randomFloat(0, 0.5), unit: "%", timestamp: now },
        { sensor: "bandwidth_mbps", value: randomFloat(85, 950), unit: "Mbps", timestamp: now },
      ],
    },
    {
      id: "pi-gpio-01",
      name: "Pi GPIO Controller",
      type: "simulated",
      status: "offline",
      protocol: "simulated",
      capabilities: ["digital_read", "digital_write", "pwm", "i2c"],
      location: "Raspberry Pi",
      lastSeen: new Date(Date.now() - 3600000).toISOString(),
      readings: [],
    },
  ];
}

const deviceStates: Map<string, Record<string, unknown>> = new Map();

router.get("/devices", (req, res) => {
  const devices = makeDevices();
  const body = ListDevicesResponse.parse({ devices });
  res.json(body);
});

router.get("/devices/stats", (req, res) => {
  const devices = makeDevices();
  const stats = {
    total: devices.length,
    online: devices.filter((d) => d.status === "online").length,
    offline: devices.filter((d) => d.status === "offline").length,
    error: devices.filter((d) => d.status === "error").length,
    byType: devices.reduce(
      (acc, d) => {
        acc[d.type] = (acc[d.type] ?? 0) + 1;
        return acc;
      },
      {} as Record<string, number>,
    ),
  };
  const body = GetDeviceStatsResponse.parse(stats);
  res.json(body);
});

router.get("/devices/:deviceId", (req, res) => {
  const params = GetDeviceParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const devices = makeDevices();
  const device = devices.find((d) => d.id === params.data.deviceId);
  if (!device) {
    res.status(404).json({ error: "Device not found" });
    return;
  }

  const body = GetDeviceResponse.parse(device);
  res.json(body);
});

router.post("/devices/:deviceId/control", (req, res) => {
  const params = ControlDeviceParams.safeParse(req.params);
  const body = ControlDeviceBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: "Invalid request" });
    return;
  }

  const { action, parameters } = body.data;
  const deviceId = params.data.deviceId;

  const existingState = deviceStates.get(deviceId) ?? {};
  const newState = { ...existingState, lastAction: action, parameters, updatedAt: new Date().toISOString() };
  deviceStates.set(deviceId, newState);

  const response = ControlDeviceResponse.parse({
    success: true,
    message: `Action "${action}" executed on device ${deviceId}`,
    newState,
  });
  res.json(response);
});

export default router;
