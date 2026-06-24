/**
 * Configurable ranking policy for the deterministic engine. Deployments tune
 * these without forking the engine; the defaults reproduce the reference demo.
 */
export interface RankPolicy {
  /** Per-signal multiplier applied to a matched showWhen weight. Default 1. */
  signalWeights?: Record<string, number>;
  /** Score gained per unit of matched showWhen weight. Default 10. */
  weightScale?: number;
  /**
   * Below this archetype confidence, the user is treated as cold-start (neutral
   * layout, archetype ignored). Default 0 — any stated archetype is trusted.
   */
  minConfidence?: number;
  /** Hard cap on total modules placed (neverHide/pinned are always retained). */
  maxModules?: number;
  /** How repeated component ids are handled. "first-wins" keeps one instance. */
  duplicatePolicy?: "first-wins";
}

export const defaultPolicy: Required<Pick<RankPolicy, "weightScale" | "minConfidence" | "duplicatePolicy">> &
  RankPolicy = {
  weightScale: 10,
  minConfidence: 0,
  duplicatePolicy: "first-wins",
};

export function resolvePolicy(policy?: RankPolicy): RankPolicy & {
  weightScale: number;
  minConfidence: number;
  duplicatePolicy: "first-wins";
} {
  return { ...defaultPolicy, ...policy };
}
