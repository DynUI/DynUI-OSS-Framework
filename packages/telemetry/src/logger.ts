import type { BehaviorEvent, BehaviorEventInput, EventLogger, EventTransport } from "./types.js";

/**
 * Buffers events and flushes them to a transport in batches (by size, or on
 * explicit flush). Keeps the client cheap and the network chatty-free.
 */
export class BatchingLogger implements EventLogger {
  private buffer: BehaviorEvent[] = [];

  constructor(
    private readonly transport: EventTransport,
    private readonly batchSize = 20,
    /** Analytics consent gate — when it returns false, events are dropped, not buffered. */
    private readonly enabled?: () => boolean,
  ) {}

  log(event: BehaviorEventInput): void {
    if (this.enabled && !this.enabled()) return; // analytics consent withheld
    this.buffer.push({ ...event, ts: event.ts ?? new Date().toISOString() });
    if (this.buffer.length >= this.batchSize) void this.flush();
  }

  async flush(): Promise<void> {
    if (this.buffer.length === 0) return;
    const batch = this.buffer;
    this.buffer = [];
    await this.transport(batch);
  }
}

/** Collects events into an array — handy for tests and demos. */
export const arraySink =
  (out: BehaviorEvent[]): EventTransport =>
  (batch) => {
    out.push(...batch);
  };

/** Logs a one-line summary per event. */
export const consoleSink: EventTransport = (batch) => {
  for (const e of batch) {
    console.log(`[event] ${e.type} ${e.componentId ?? e.goal ?? ""}`.trimEnd());
  }
};

/**
 * Mark an event for (or against) model training based on consent. When training
 * consent is withheld, `trainable:false` is stamped so export flows exclude it.
 */
export const markTraining = (
  event: BehaviorEventInput,
  trainingConsent: boolean,
): BehaviorEventInput => (trainingConsent ? event : { ...event, trainable: false });
