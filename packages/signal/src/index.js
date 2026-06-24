/**
 * Resolve a dotted signal path against a SignalProfile.
 *
 * `behavior.*`, `preferences.*`, and `traits.*` are flat namespaced maps, so the
 * remainder after the first segment is a single key (e.g.
 * "behavior.fitness.engagement.charts.openRate" -> profile.behavior[
 * "fitness.engagement.charts.openRate"]). Everything else is a nested lookup
 * (e.g. "archetype.primary", "context.device.theme").
 */
export function getSignal(profile, path) {
    if (path.startsWith("behavior."))
        return profile.behavior[path.slice(9)];
    if (path.startsWith("preferences."))
        return profile.preferences[path.slice(12)];
    if (path.startsWith("traits."))
        return profile.traits[path.slice(7)];
    let cur = profile;
    for (const seg of path.split(".")) {
        if (cur == null || typeof cur !== "object")
            return undefined;
        cur = cur[seg];
    }
    return cur;
}
export function evalCondition(profile, cond) {
    const v = getSignal(profile, cond.signal);
    switch (cond.op) {
        case "exists":
            return v !== undefined && v !== null;
        case "eq":
            return v === cond.value;
        case "neq":
            return v !== cond.value;
        case "gt":
            return typeof v === "number" && v > cond.value;
        case "gte":
            return typeof v === "number" && v >= cond.value;
        case "lt":
            return typeof v === "number" && v < cond.value;
        case "lte":
            return typeof v === "number" && v <= cond.value;
        case "in":
            return (Array.isArray(cond.value) && cond.value.includes(v));
        default:
            return false;
    }
}
/** True only if every condition passes (empty list = matches everyone). */
export function matchesAll(profile, conditions) {
    return (conditions ?? []).every((c) => evalCondition(profile, c));
}
