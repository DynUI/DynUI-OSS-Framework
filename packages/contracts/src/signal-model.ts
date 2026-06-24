import type { SignalCondition } from "./component-manifest.js";

/**
 * SignalModel — the DOMAIN-CONFIGURABLE inference artifact.
 *
 * It replaces hardcoded archetype inference: a domain declares its segments and
 * how signals weigh into each, plus the thresholds/decay/cold-start policy. The
 * core evaluator (`inferSegment` in @dynui/signal) is domain-agnostic, so a new
 * domain ships a SignalModel + renderer components — never edits to core code.
 */
export interface SignalModel {
  schemaVersion: string; // "signal-model/1.0"
  domain: string; // e.g. "fitness"
  version: string; // semver of this model
  segments: SegmentDef[];

  /** Minimum leading-segment score before any segment is asserted (else neutral). */
  minEvidence?: number;
  /** Confidence below which generation should treat the user as cold/neutral. */
  minConfidence?: number;
  /**
   * A secondary segment is only reported when its share of total score is at least
   * this fraction of the primary's (bounds over-eager secondary targeting).
   */
  secondaryMinShare?: number;
  /** Exponential behavior decay applied during aggregation/ingestion. */
  decay?: { halfLifeMs: number };
  /** Optional cold-start default segment when there is no evidence. */
  coldStart?: { segment?: string };
  /**
   * If the profile has an explicit preference at this path whose value is a known
   * segment id, it OVERRIDES inference (confidence 1).
   */
  preferenceOverride?: { path: string };
}

export interface SegmentDef {
  id: string; // segment/archetype id, e.g. "performance"
  /** Weighted signal contributions that score this segment. */
  signals: SignalContribution[];
}

/**
 * A signal's contribution to a segment's score. By default the signal's numeric
 * value is multiplied by `weight`. If `op`/`value` are given, the condition is
 * evaluated as a gate (0 or 1) and multiplied by `weight` instead.
 */
export interface SignalContribution {
  signal: string;
  weight: number;
  op?: SignalCondition["op"];
  value?: SignalCondition["value"];
}

/** Result of evaluating a SignalModel against a profile. */
export interface SegmentInference {
  primary: string;
  confidence: number; // 0..1
  secondary?: string;
}
