/** Which archetype each engagement signal points to. */
const SIGNAL_ARCHETYPE = {
    "fitness.engagement.charts.openRate": "performance",
    "fitness.engagement.insights.readRate": "wellness",
    "fitness.engagement.social.kudosRate": "social",
};
/**
 * Reduce a stream of behavior events into engagement signals, keyed by each
 * component's declared `engagementSignal`. Rate = taps / exposures, clamped to
 * [0,1]. This is the bridge from raw interactions to SignalProfile.behavior.
 */
export function aggregateBehavior(events, manifest) {
    const signalOf = new Map(manifest.components
        .filter((c) => c.engagementSignal)
        .map((c) => [c.id, c.engagementSignal]));
    const exposures = new Map();
    const taps = new Map();
    for (const e of events) {
        const sig = e.componentId ? signalOf.get(e.componentId) : undefined;
        if (!sig)
            continue;
        if (e.type === "exposure")
            exposures.set(sig, (exposures.get(sig) ?? 0) + 1);
        else if (e.type === "tap")
            taps.set(sig, (taps.get(sig) ?? 0) + 1);
    }
    const out = {};
    for (const [sig, n] of exposures) {
        out[sig] = Math.min(1, (taps.get(sig) ?? 0) / n);
    }
    return out;
}
/**
 * Infer the dominant archetype from engagement signals. Confidence = the leading
 * signal's share of total engagement. Returns undefined if there's no engagement.
 */
export function inferArchetype(behavior) {
    let best;
    let bestVal = 0;
    let sum = 0;
    for (const [signal, archetype] of Object.entries(SIGNAL_ARCHETYPE)) {
        const v = behavior[signal] ?? 0;
        sum += v;
        if (v > bestVal) {
            bestVal = v;
            best = archetype;
        }
    }
    if (!best || bestVal <= 0)
        return undefined;
    return { primary: best, confidence: sum > 0 ? Number((bestVal / sum).toFixed(2)) : 0.5 };
}
/**
 * Merge aggregated engagement back into a profile: update behavior and re-infer
 * archetype. This is what a Profile Adapter would persist between sessions.
 */
export function applyBehavior(profile, behaviorDelta) {
    const behavior = { ...profile.behavior, ...behaviorDelta };
    const archetype = inferArchetype(behavior) ?? profile.archetype;
    return { ...profile, behavior, archetype };
}
