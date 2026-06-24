import type { SignalProfile } from "@dynui/contracts";
import { matchesAll } from "@dynui/signal";
import type { ExperimentDef } from "./types.js";

/**
 * Deterministic string hash → a stable float in [0, 1).
 * Same idea as GrowthBook/Statsig bucketing: a user's assignment never changes,
 * and no server round-trip is needed. (cyrb53.)
 */
export function hashFraction(key: string): number {
  let h1 = 0xdeadbeef ^ key.length;
  let h2 = 0x41c6ce57 ^ key.length;
  for (let i = 0; i < key.length; i++) {
    const ch = key.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  const n = 4294967296 * (2097151 & h2) + (h1 >>> 0);
  return (n % 1_000_000) / 1_000_000;
}

/**
 * Assign a user to a variant, or null if they are not in the experiment
 * (off-segment, or excluded by allocation). Two independent hashes: one for the
 * allocation gate, one for the variant split.
 */
export function assignVariant(
  exp: ExperimentDef,
  profile: SignalProfile,
): string | null {
  if (!matchesAll(profile, exp.segment)) return null;

  const id = profile.subject.anonId;
  if (hashFraction(`${exp.id}:gate:${id}`) >= exp.allocation) return null;

  const total = exp.variants.reduce((s, v) => s + v.weight, 0) || 1;
  let roll = hashFraction(`${exp.id}:variant:${id}`) * total;
  for (const v of exp.variants) {
    roll -= v.weight;
    if (roll < 0) return v.id;
  }
  return exp.variants[exp.variants.length - 1]?.id ?? null;
}
