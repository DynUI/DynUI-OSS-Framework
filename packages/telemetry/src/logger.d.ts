import type { BehaviorEvent, BehaviorEventInput, EventLogger, EventTransport } from "./types.js";
/**
 * Buffers events and flushes them to a transport in batches (by size, or on
 * explicit flush). Keeps the client cheap and the network chatty-free.
 */
export declare class BatchingLogger implements EventLogger {
    private readonly transport;
    private readonly batchSize;
    private buffer;
    constructor(transport: EventTransport, batchSize?: number);
    log(event: BehaviorEventInput): void;
    flush(): Promise<void>;
}
/** Collects events into an array — handy for tests and demos. */
export declare const arraySink: (out: BehaviorEvent[]) => EventTransport;
/** Logs a one-line summary per event. */
export declare const consoleSink: EventTransport;
