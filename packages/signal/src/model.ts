import type {
  SignalContribution,
  SignalModel,
  SignalProfile,
  SegmentInference,
} from "@dynui/contracts";
import { evalCondition, getSignal } from "./index.js";

/**
 * Domain-agnostic SignalModel evaluation. The inference LOGIC lives here; the
 * domain CONFIG lives in the SignalModel artifact — so a new domain ships a model,
 * not edits to this file.
 */

function contributionScore(profile: SignalProfile, c: SignalContribution): number {
  if (c.op) {
    return evalCondition(profile, { signal: c.signal, op: c.op, value: c.value }) ? c.weight : 0;
  }
  const v = getSignal(profile, c.signal);
  return typeof v === "number" ? v * c.weight : 0;
}

/** Infer the user's segment from a profile using a domain SignalModel. */
export function inferSegment(
  profile: SignalProfile,
  model: SignalModel,
): SegmentInference | undefined {
  const segmentIds = new Set(model.segments.map((s) => s.id));

  // Explicit preference overrides inference where policy declares it.
  if (model.preferenceOverride) {
    const pref = getSignal(profile, model.preferenceOverride.path);
    if (typeof pref === "string" && segmentIds.has(pref)) {
      return { primary: pref, confidence: 1 };
    }
  }

  const scored = model.segments
    .map((s) => ({ id: s.id, score: s.signals.reduce((a, c) => a + contributionScore(profile, c), 0) }))
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score);

  const total = scored.reduce((a, s) => a + s.score, 0);
  const coldStart = (): SegmentInference | undefined =>
    model.coldStart?.segment ? { primary: model.coldStart.segment, confidence: 0 } : undefined;

  if (scored.length === 0 || total <= 0) return coldStart();
  const best = scored[0];
  if (model.minEvidence != null && best.score < model.minEvidence) return coldStart();

  const inference: SegmentInference = {
    primary: best.id,
    confidence: Number((best.score / total).toFixed(2)),
  };
  const second = scored[1];
  const minShare = model.secondaryMinShare ?? 0.5;
  if (second && second.score >= best.score * minShare) inference.secondary = second.id;
  return inference;
}

/**
 * Apply exponential time decay to a behavior map. Older evidence is worth less, so
 * a user's segment can drift back toward neutral if they go quiet.
 */
export function applyDecay(
  behavior: Record<string, number>,
  elapsedMs: number,
  halfLifeMs: number | undefined,
): Record<string, number> {
  if (!halfLifeMs || halfLifeMs <= 0 || elapsedMs <= 0) return { ...behavior };
  const factor = Math.pow(0.5, elapsedMs / halfLifeMs);
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(behavior)) out[k] = Number((v * factor).toFixed(4));
  return out;
}
