/**
 * Buffers events and flushes them to a transport in batches (by size, or on
 * explicit flush). Keeps the client cheap and the network chatty-free.
 */
export class BatchingLogger {
    transport;
    batchSize;
    buffer = [];
    constructor(transport, batchSize = 20) {
        this.transport = transport;
        this.batchSize = batchSize;
    }
    log(event) {
        this.buffer.push({ ...event, ts: event.ts ?? new Date().toISOString() });
        if (this.buffer.length >= this.batchSize)
            void this.flush();
    }
    async flush() {
        if (this.buffer.length === 0)
            return;
        const batch = this.buffer;
        this.buffer = [];
        await this.transport(batch);
    }
}
/** Collects events into an array — handy for tests and demos. */
export const arraySink = (out) => (batch) => {
    out.push(...batch);
};
/** Logs a one-line summary per event. */
export const consoleSink = (batch) => {
    for (const e of batch) {
        console.log(`[event] ${e.type} ${e.componentId ?? e.goal ?? ""}`.trimEnd());
    }
};
