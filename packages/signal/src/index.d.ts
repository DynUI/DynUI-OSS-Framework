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
export declare function getSignal(profile: SignalProfile, path: string): JsonValue | undefined;
export declare function evalCondition(profile: SignalProfile, cond: SignalCondition): boolean;
/** True only if every condition passes (empty list = matches everyone). */
export declare function matchesAll(profile: SignalProfile, conditions: SignalCondition[] | undefined): boolean;
