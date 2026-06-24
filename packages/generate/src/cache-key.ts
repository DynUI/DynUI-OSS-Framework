import type { ExperimentAssignment, SignalProfile } from "@dynui/contracts";

/**
 * Deterministic, PII-free cache key for a generated screen.
 *
 * The key is a pure function of the dimensions that actually change the layout:
 * manifest version, surface, the stable archetype SEGMENT, experiment assignments,
 * and a few coarse context dimensions. It deliberately EXCLUDES the anonId and the
 * raw behavior map — two users in the same segment/context must collide so the
 * cache is shareable and no identifier leaks into the key.
 */
export interface CacheKeyInput {
  manifestVersion: string;
  surface: string;
  /** Archetype-derived segment; "neutral" when there is no usable archetype. */
  segment: string;
  secondary?: string;
  experiments: ExperimentAssignment[];
  context?: {
    platform?: string;
    theme?: string;
    reducedMotion?: boolean;
    locale?: string;
  };
}

/** Stable JSON: object keys sorted recursively, so equal inputs serialize equally. */
function stable(v: unknown): string {
  if (v === null || typeof v !== "object") return JSON.stringify(v) ?? "null";
  if (Array.isArray(v)) return `[${v.map(stable).join(",")}]`;
  const o = v as Record<string, unknown>;
  return `{${Object.keys(o)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${stable(o[k])}`)
    .join(",")}}`;
}

export function buildCacheKey(input: CacheKeyInput): string {
  const ctx: Record<string, unknown> = {};
  if (input.context?.platform != null) ctx.platform = input.context.platform;
  if (input.context?.theme != null) ctx.theme = input.context.theme;
  if (input.context?.reducedMotion != null) ctx.reducedMotion = input.context.reducedMotion;
  if (input.context?.locale != null) ctx.locale = input.context.locale;

  return stable({
    m: input.manifestVersion,
    s: input.surface,
    seg: input.segment,
    sec: input.secondary ?? null,
    exp: input.experiments.map((e) => `${e.experimentId}:${e.variant}`).sort(),
    ctx,
  });
}

/**
 * Derive the cache-key context dimensions from a profile, picking only the coarse,
 * non-identifying fields that influence composition.
 */
export function cacheContextFromProfile(profile: SignalProfile): CacheKeyInput["context"] {
  return {
    platform: profile.context?.device?.platform,
    theme: profile.context?.device?.theme,
    reducedMotion: profile.context?.device?.reducedMotion,
    locale: profile.context?.locale,
  };
}
