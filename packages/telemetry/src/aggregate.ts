import type { ComponentManifest, SignalModel, SignalProfile } from "@dynui/contracts";
import { inferSegment } from "@dynui/signal";
import type { BehaviorEvent } from "./types.js";

/**
 * The reference fitness SignalModel. This is DOMAIN DATA (the reference domain's
 * config), not core logic — a new domain ships its own SignalModel and calls
 * `inferSegment` directly, with no edits here.
 */
export const DEFAULT_FITNESS_SIGNAL_MODEL: SignalModel = {
  schemaVersion: "signal-model/1.0",
  domain: "fitness",
  version: "1.0.0",
  segments: [
    { id: "performance", signals: [{ signal: "behavior.fitness.engagement.charts.openRate", weight: 1 }] },
    { id: "wellness", signals: [{ signal: "behavior.fitness.engagement.insights.readRate", weight: 1 }] },
    { id: "social", signals: [{ signal: "behavior.fitness.engagement.social.kudosRate", weight: 1 }] },
  ],
};

/**
 * Reduce a stream of behavior events into engagement signals, keyed by each
 * component's declared `engagementSignal`. Rate = taps / exposures, clamped to
 * [0,1]. Events are DEDUPLICATED by `id` so re-delivered events never inflate.
 */
export function aggregateBehavior(
  events: BehaviorEvent[],
  manifest: ComponentManifest,
): Record<string, number> {
  const signalOf = new Map(
    manifest.components
      .filter((c) => c.engagementSignal)
      .map((c) => [c.id, c.engagementSignal as string]),
  );

  const seen = new Set<string>();
  const exposures = new Map<string, number>();
  const taps = new Map<string, number>();
  for (const e of events) {
    if (e.id != null) {
      if (seen.has(e.id)) continue; // idempotent: drop duplicate events
      seen.add(e.id);
    }
    const sig = e.componentId ? signalOf.get(e.componentId) : undefined;
    if (!sig) continue;
    if (e.type === "exposure") exposures.set(sig, (exposures.get(sig) ?? 0) + 1);
    else if (e.type === "tap") taps.set(sig, (taps.get(sig) ?? 0) + 1);
  }

  const out: Record<string, number> = {};
  for (const [sig, n] of exposures) {
    out[sig] = Math.min(1, (taps.get(sig) ?? 0) / n);
  }
  return out;
}

const behaviorProfile = (behavior: Record<string, number>): SignalProfile =>
  ({ behavior, preferences: {}, traits: {} }) as SignalProfile;

/**
 * Infer the dominant archetype from engagement signals using a SignalModel
 * (defaults to the reference fitness model). Returns `{ primary, confidence }`
 * (back-compat shape — no secondary) or undefined when there is no evidence.
 */
export function inferArchetype(
  behavior: Record<string, number>,
  model: SignalModel = DEFAULT_FITNESS_SIGNAL_MODEL,
): { primary: string; confidence: number } | undefined {
  const seg = inferSegment(behaviorProfile(behavior), model);
  if (!seg || seg.confidence <= 0) return undefined;
  return { primary: seg.primary, confidence: seg.confidence };
}

/**
 * Merge aggregated engagement back into a profile: update behavior and re-infer
 * archetype. This is what a Profile Adapter would persist between sessions.
 */
export function applyBehavior(
  profile: SignalProfile,
  behaviorDelta: Record<string, number>,
  model: SignalModel = DEFAULT_FITNESS_SIGNAL_MODEL,
): SignalProfile {
  const behavior = { ...profile.behavior, ...behaviorDelta };
  const archetype = inferArchetype(behavior, model) ?? profile.archetype;
  return { ...profile, behavior, archetype };
}
