/**
 * EXAMPLE — not a dependency, not imported by any @dynui/* package.
 *
 * A lightweight `AssignmentAdapter` that defers experiment bucketing to an external
 * feature-flag / experimentation engine (GrowthBook-style; the same shape fits
 * Statsig / LaunchDarkly / Unleash). The unit of assignment stays a registered
 * component/variant — the external tool only owns *which* variant a user gets.
 *
 * We model the vendor SDK as a tiny interface so this example needs no vendor
 * dependency. In your app, wrap the real SDK behind the same `evaluate` shape.
 */
import type { AssignmentAdapter, ExperimentDef } from "@dynui/experiments";
import type { SignalProfile } from "@dynui/contracts";

/** Minimal slice of a GrowthBook-like client. Replace with the real SDK. */
export interface FeatureClient {
  /**
   * Return the variant id this user is bucketed into for `experimentKey`, or null
   * if the user is not in the experiment. MUST be stable for a fixed user + key.
   */
  evaluate(experimentKey: string, attributes: Record<string, unknown>): string | null;
}

/**
 * Bridges a `FeatureClient` to the DynUI assignment seam. Assignment is keyed
 * on the experiment id and the *anonymous* subject id — no PII is sent to the vendor.
 * Only coarse, non-sensitive attributes (segment, surface) are forwarded, so the
 * vendor can target without learning the user's identity or raw behavior.
 */
export class GrowthBookAssignmentAdapter implements AssignmentAdapter {
  constructor(private readonly client: FeatureClient) {}

  assign(exp: ExperimentDef, profile: SignalProfile): string | null {
    const attributes = {
      id: profile.subject.anonId, // anonymous, stable bucketing key
      segment: profile.archetype?.primary ?? "neutral",
      surface: profile.context?.surface,
    };
    const variant = this.client.evaluate(exp.id, attributes);
    // Only honor a variant the experiment actually declares.
    if (variant && exp.variants.some((v) => v.id === variant)) return variant;
    return null;
  }
}
