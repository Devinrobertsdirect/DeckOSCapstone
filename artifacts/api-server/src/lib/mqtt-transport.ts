import { EventBus } from "@workspace/event-bus";
import { logger } from "./logger.js";
import type { DeviceManager, DeviceReading } from "./device-manager.js";

const RECONNECT_BASE_MS = 1000;
const RECONNECT_MAX_MS = 30000;

export class MqttTransport {
  private client: import("mqtt").MqttClient | null = null;
  private reconnectAttempts = 0;
  private shuttingDown = false;
  private brokerUrl: string;

  constructor(
    private bus: EventBus,
    private deviceManager: DeviceManager,
  ) {
    this.brokerUrl = process.env["MQTT_BROKER_URL"] ?? "";

    this.bus.subscribe("device.command.send", (event) => {
      const p = event.payload as Record<string, unknown>;
      if (p?.deviceId && this.client?.connected) {
        const deviceId = String(p.deviceId);
        const device = this.deviceManager.getDevice(deviceId);
        if (device && (device.protocol === "mqtt" || device.protocol === "simulated")) {
          const topic = `jarvis/device/${deviceId}/command`;
          const msg = JSON.stringify({ action: p.action, parameters: p.parameters });
          this.client.publish(topic, msg, { qos: 1 });
          logger.debug({ deviceId, topic }, "MqttTransport: published command");
        }
      }
    });
  }

  async start(): Promise<void> {
    if (!this.brokerUrl) {
      logger.info("MqttTransport: MQTT_BROKER_URL not set — running in simulation-only mode");
      return;
    }

    await this.connect();
  }

  private async connect(): Promise<void> {
    if (this.shuttingDown) return;

    try {
      const mqtt = await import("mqtt");
      this.client = mqtt.connect(this.brokerUrl, {
        clientId: `jarvis-deck-os-${Date.now()}`,
        reconnectPeriod: 0,
        connectTimeout: 10_000,
      });

      this.client.on("connect", () => {
        this.reconnectAttempts = 0;
        logger.info({ brokerUrl: this.brokerUrl }, "MqttTransport: connected to MQTT broker");
        this.client!.subscribe("jarvis/#", { qos: 1 }, (err) => {
          if (err) {
            logger.error({ err }, "MqttTransport: failed to subscribe to jarvis/#");
          } else {
            logger.info("MqttTransport: subscribed to jarvis/#");
          }
        });

        this.bus.emit({
          source: "mqtt-transport",
          target: null,
          type: "device.connected",
          payload: { transport: "mqtt", brokerUrl: this.brokerUrl },
        });
      });

      this.client.on("message", (topic: string, payload: Buffer) => {
        this.handleIncomingMessage(topic, payload);
      });

      this.client.on("error", (err: Error) => {
        logger.error({ err }, "MqttTransport: MQTT error");
        this.bus.emit({
          source: "mqtt-transport",
          target: null,
          type: "device.error",
          payload: { transport: "mqtt", error: err.message },
        });
      });

      this.client.on("close", () => {
        if (!this.shuttingDown) {
          logger.warn("MqttTransport: connection closed, scheduling reconnect");
          this.scheduleReconnect();
        }
      });
    } catch (err) {
      logger.error({ err }, "MqttTransport: failed to connect");
      this.scheduleReconnect();
    }
  }

  private handleIncomingMessage(topic: string, payload: Buffer): void {
    const parts = topic.split("/");

    try {
      const data = JSON.parse(payload.toString()) as Record<string, unknown>;

      if (parts[0] === "jarvis" && parts[1] === "device" && parts[2] && parts[3] === "state") {
        const deviceId = parts[2];
        let device = this.deviceManager.getDevice(deviceId);

        if (!device) {
          const autoName = (data["name"] as string | undefined) ?? `mqtt-device-${deviceId}`;
          const autoType = (data["type"] as "sensor" | "actuator" | "display" | "network" | "simulated" | undefined) ?? "sensor";
          device = this.deviceManager.register({
            id: deviceId,
            name: autoName,
            category: autoType === "actuator" ? "actuator" : "sensor",
            type: autoType,
            protocol: "mqtt",
            capabilities: (data["capabilities"] as string[] | undefined) ?? [],
            location: (data["location"] as string | undefined) ?? null,
          });
          logger.info({ deviceId, autoName }, "MqttTransport: auto-registered new MQTT device");
        }

        const readings = Array.isArray(data["readings"]) ? data["readings"] as DeviceReading[] : [];
        this.deviceManager.updateState(deviceId, {
          status: "online",
          readings,
        });
        return;
      }

      if (parts[0] === "jarvis" && parts[1] === "system" && parts[2] === "broadcast") {
        this.bus.emit({
          source: "mqtt-transport",
          target: null,
          type: "system.heartbeat",
          payload: data,
        });
        return;
      }

      this.bus.emit({
        source: "mqtt-transport",
        target: null,
        type: "device.reading",
        payload: { topic, data },
      });
    } catch (err) {
      logger.warn({ err, topic }, "MqttTransport: failed to parse message");
    }
  }

  private scheduleReconnect(): void {
    if (this.shuttingDown) return;
    const delay = Math.min(
      RECONNECT_BASE_MS * Math.pow(2, this.reconnectAttempts),
      RECONNECT_MAX_MS,
    );
    this.reconnectAttempts++;
    logger.info({ delay, attempt: this.reconnectAttempts }, "MqttTransport: reconnecting in ms");
    setTimeout(() => void this.connect(), delay);
  }

  async stop(): Promise<void> {
    this.shuttingDown = true;
    if (this.client) {
      await new Promise<void>((resolve) => {
        this.client!.end(true, {}, () => resolve());
      });
      this.client = null;
    }
  }
}
