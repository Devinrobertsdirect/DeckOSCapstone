import { randomUUID } from "crypto";
import type { BusEvent, EventFilter, EventHandler, EventType } from "./types.js";

type Subscription = {
  id: string;
  type: string;
  handler: EventHandler;
};

type PersistFn = (event: BusEvent) => void;
type LogFn = (msg: string, data?: unknown) => void;

export class EventBus {
  private subscriptions: Subscription[] = [];
  private queue: BusEvent[] = [];
  private processing = false;
  private memoryHistory: BusEvent[] = [];
  private readonly maxMemoryHistory = 500;
  private persistFn?: PersistFn;
  private logError: LogFn = console.error;

  constructor(opts?: { persist?: PersistFn; logError?: LogFn }) {
    this.persistFn = opts?.persist;
    if (opts?.logError) {
      this.logError = opts.logError;
    }
  }

  emit(event: Omit<BusEvent, "id" | "timestamp">): void {
    const full: BusEvent = {
      ...event,
      id: randomUUID(),
      timestamp: new Date().toISOString(),
    };
    this.queue.push(full);
    this.drain();
  }

  subscribe(type: EventType | string, handler: EventHandler): string {
    const id = randomUUID();
    this.subscriptions.push({ id, type, handler });
    return id;
  }

  unsubscribe(subscriptionId: string): void {
    this.subscriptions = this.subscriptions.filter(
      (s) => s.id !== subscriptionId,
    );
  }

  history(filter?: EventFilter): BusEvent[] {
    let results = [...this.memoryHistory];

    if (filter?.type) {
      results = results.filter((e) => e.type === filter.type);
    }
    if (filter?.source) {
      results = results.filter((e) => e.source === filter.source);
    }

    results = results.reverse();

    const offset = filter?.offset ?? 0;
    const limit = filter?.limit ?? 100;
    return results.slice(offset, offset + limit);
  }

  private drain(): void {
    if (this.processing) return;
    this.processing = true;
    void this.processLoop();
  }

  private async processLoop(): Promise<void> {
    while (this.queue.length > 0) {
      const event = this.queue.shift()!;
      await this.dispatch(event);
    }
    this.processing = false;
  }

  private async dispatch(event: BusEvent): Promise<void> {
    this.memoryHistory.push(event);
    if (this.memoryHistory.length > this.maxMemoryHistory) {
      this.memoryHistory.shift();
    }

    if (this.persistFn) {
      try {
        this.persistFn(event);
      } catch (err) {
        this.logError("EventBus: persist error", err);
      }
    }

    const matching = this.subscriptions.filter(
      (s) =>
        s.type === "*" ||
        s.type === event.type ||
        (event.type.startsWith(s.type + ".") ) ||
        (event.target === null || s.type === event.target),
    );

    for (const sub of matching) {
      try {
        await sub.handler(event);
      } catch (err) {
        this.logError(`EventBus: handler error for type=${event.type}`, err);
      }
    }
  }
}
