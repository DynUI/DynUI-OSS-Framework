/**
 * EXAMPLE — not a dependency, not imported by any @dynui/* package.
 *
 * An `EventSink` that forwards experiment exposure/goal events to an external
 * analytics destination (a Segment-style track API, or a warehouse loader). It keeps
 * the in-memory counters the analysis needs while ALSO streaming each event out.
 *
 * Privacy: only the anonymous id, experiment/variant ids, and coarse segment leave
 * the process — never a real user id, email, or raw behavior. A tiny redaction guard
 * makes that explicit and testable.
 */
import type { EventSink } from "@dynui/experiments";

/** Minimal slice of a Segment-style destination. Replace with the real client. */
export interface AnalyticsDestination {
  track(event: { name: string; anonId: string; properties: Record<string, unknown> }): void;
}

// Keys we refuse to forward, even if a caller accidentally supplies them.
const PII_KEYS = new Set(["userId", "user_id", "email", "name", "phone", "ip"]);

function assertNoPii(properties: Record<string, unknown>): void {
  for (const k of Object.keys(properties)) {
    if (PII_KEYS.has(k)) {
      throw new Error(`warehouse sink: refusing to forward PII property '${k}'`);
    }
  }
}

interface Counter {
  exposures: Map<string, Set<string>>; // key -> anonIds (dedup)
  conversions: Map<string, Set<string>>;
  segments: Set<string>;
}

export class WarehouseTelemetrySink implements EventSink {
  private readonly byExp = new Map<string, Counter>();

  constructor(private readonly destination: AnalyticsDestination) {}

  private counter(experimentId: string): Counter {
    let c = this.byExp.get(experimentId);
    if (!c) {
      c = { exposures: new Map(), conversions: new Map(), segments: new Set() };
      this.byExp.set(experimentId, c);
    }
    return c;
  }

  private key(variant: string, segment?: string): string {
    return segment ? `${variant}::${segment}` : variant;
  }

  private forward(name: string, experimentId: string, variant: string, anonId: string, segment?: string): void {
    const properties: Record<string, unknown> = { experimentId, variant, segment: segment ?? null };
    assertNoPii(properties); // belt-and-suspenders: no PII leaves the process
    this.destination.track({ name, anonId, properties });
  }

  recordExposure(experimentId: string, variant: string, anonId: string, segment?: string): void {
    const c = this.counter(experimentId);
    const k = this.key(variant, segment);
    (c.exposures.get(k) ?? c.exposures.set(k, new Set()).get(k)!).add(anonId);
    if (segment) c.segments.add(segment);
    this.forward("dynui_exposure", experimentId, variant, anonId, segment);
  }

  recordGoal(experimentId: string, variant: string, anonId: string, segment?: string): void {
    const c = this.counter(experimentId);
    const k = this.key(variant, segment);
    (c.conversions.get(k) ?? c.conversions.set(k, new Set()).get(k)!).add(anonId);
    if (segment) c.segments.add(segment);
    this.forward("dynui_goal", experimentId, variant, anonId, segment);
  }

  exposures(experimentId: string, variant: string, segment?: string): number {
    return this.byExp.get(experimentId)?.exposures.get(this.key(variant, segment))?.size ?? 0;
  }

  conversions(experimentId: string, variant: string, segment?: string): number {
    return this.byExp.get(experimentId)?.conversions.get(this.key(variant, segment))?.size ?? 0;
  }

  segments(experimentId: string): string[] {
    return [...(this.byExp.get(experimentId)?.segments ?? [])];
  }
}
