/**
 * Behavior events emitted by the client as the user interacts with rendered
 * components. They flow back through the aggregator into SignalProfile.behavior,
 * and exposure/goal events also feed the experiment engine.
 */
/**
 * Event semantics:
 *  - exposure   : the component was actually rendered/visible (once per generation)
 *  - impression : it entered the viewport (a stricter, scroll-based signal)
 *  - tap        : the user activated it
 *  - dwell      : time-on-component
 *  - goal       : a success metric fired
 *  - dismissal  : the user dismissed/closed it
 *  - render-error : the renderer failed for this component (NOT an exposure)
 *  - fallback   : the generation fell back to the deterministic engine
 */
export type BehaviorEventType =
  | "exposure"
  | "impression"
  | "tap"
  | "dwell"
  | "goal"
  | "dismissal"
  | "render-error"
  | "fallback";

export interface BehaviorEvent {
  type: BehaviorEventType;
  /** Stable event id for idempotent aggregation (duplicates are dropped). */
  id?: string;
  anonId: string;
  surface: string;
  componentId?: string;
  /** Manifest version of the component, for attribution across versions. */
  componentVersion?: string;
  /** The generation this event belongs to (ties events to one composed screen). */
  generationId?: string;
  /** The tree/cache key the screen was served under. */
  treeKey?: string;
  /** Present when the component was shown under an experiment assignment. */
  experimentId?: string;
  variant?: string;
  /** Present on goal events — the success metric that fired. */
  goal?: string;
  /** Dwell ms, scroll depth, or goal value. */
  value?: number;
  ts: string;
  /**
   * False when the user withheld model-training consent — training/export flows
   * MUST exclude these events. Omitted = no restriction recorded.
   */
  trainable?: boolean;
}

export type BehaviorEventInput = Omit<BehaviorEvent, "ts"> & { ts?: string };

/** Client-side logging surface the app calls. */
export interface EventLogger {
  log(event: BehaviorEventInput): void;
  flush(): Promise<void>;
}

/** Where flushed batches go (HTTP collector, warehouse, in-memory test sink). */
export type EventTransport = (batch: BehaviorEvent[]) => void | Promise<void>;
