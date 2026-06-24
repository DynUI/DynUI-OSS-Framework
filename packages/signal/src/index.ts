import type { SignalProfile, SignalCondition, JsonValue } from "@dynui/contracts";

/**
 * Resolve a dotted signal path against a SignalProfile.
 *
 * `behavior.*`, `preferences.*`, and `traits.*` are flat namespaced maps, so the
 * remainder after the first segment is a single key (e.g.
 * "behavior.fitness.engagement.charts.openRate" -> profile.behavior[
 * "fitness.engagement.charts.openRate"]). Everything else is a nested lookup
 * (e.g. "archetype.primary", "context.device.theme").
 */
export function getSignal(
  profile: SignalProfile,
  path: string,
): JsonValue | undefined {
  if (path.startsWith("behavior.")) return profile.behavior[path.slice(9)];
  if (path.startsWith("preferences.")) return profile.preferences[path.slice(12)];
  if (path.startsWith("traits.")) return profile.traits[path.slice(7)];

  let cur: unknown = profile;
  for (const seg of path.split(".")) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[seg];
  }
  return cur as JsonValue | undefined;
}

export function evalCondition(
  profile: SignalProfile,
  cond: SignalCondition,
): boolean {
  const v = getSignal(profile, cond.signal);
  switch (cond.op) {
    case "exists":
      return v !== undefined && v !== null;
    case "eq":
      return v === cond.value;
    case "neq":
      return v !== cond.value;
    case "gt":
      return typeof v === "number" && v > (cond.value as number);
    case "gte":
      return typeof v === "number" && v >= (cond.value as number);
    case "lt":
      return typeof v === "number" && v < (cond.value as number);
    case "lte":
      return typeof v === "number" && v <= (cond.value as number);
    case "in":
      return (
        Array.isArray(cond.value) && (cond.value as JsonValue[]).includes(v as JsonValue)
      );
    default:
      return false;
  }
}

/** True only if every condition passes (empty list = matches everyone). */
export function matchesAll(
  profile: SignalProfile,
  conditions: SignalCondition[] | undefined,
): boolean {
  return (conditions ?? []).every((c) => evalCondition(profile, c));
}

// Domain-configurable SignalModel evaluation (inferSegment, applyDecay).
export { inferSegment, applyDecay } from "./model.js";
