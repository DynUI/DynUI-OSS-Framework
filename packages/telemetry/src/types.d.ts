/**
 * Behavior events emitted by the client as the user interacts with rendered
 * components. They flow back through the aggregator into SignalProfile.behavior,
 * and exposure/goal events also feed the experiment engine.
 */
export type BehaviorEventType = "exposure" | "tap" | "dwell" | "goal";
export interface BehaviorEvent {
    type: BehaviorEventType;
    anonId: string;
    surface: string;
    componentId?: string;
    /** Present when the component was shown under an experiment assignment. */
    experimentId?: string;
    variant?: string;
    /** Present on goal events — the success metric that fired. */
    goal?: string;
    /** Dwell ms, scroll depth, or goal value. */
    value?: number;
    ts: string;
}
export type BehaviorEventInput = Omit<BehaviorEvent, "ts"> & {
    ts?: string;
};
/** Client-side logging surface the app calls. */
export interface EventLogger {
    log(event: BehaviorEventInput): void;
    flush(): Promise<void>;
}
/** Where flushed batches go (HTTP collector, warehouse, in-memory test sink). */
export type EventTransport = (batch: BehaviorEvent[]) => void | Promise<void>;
