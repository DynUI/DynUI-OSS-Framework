import type { ComponentManifest, SignalProfile } from "@dynui/contracts";
import type { BehaviorEvent } from "./types.js";
/**
 * Reduce a stream of behavior events into engagement signals, keyed by each
 * component's declared `engagementSignal`. Rate = taps / exposures, clamped to
 * [0,1]. This is the bridge from raw interactions to SignalProfile.behavior.
 */
export declare function aggregateBehavior(events: BehaviorEvent[], manifest: ComponentManifest): Record<string, number>;
/**
 * Infer the dominant archetype from engagement signals. Confidence = the leading
 * signal's share of total engagement. Returns undefined if there's no engagement.
 */
export declare function inferArchetype(behavior: Record<string, number>): {
    primary: string;
    confidence: number;
} | undefined;
/**
 * Merge aggregated engagement back into a profile: update behavior and re-infer
 * archetype. This is what a Profile Adapter would persist between sessions.
 */
export declare function applyBehavior(profile: SignalProfile, behaviorDelta: Record<string, number>): SignalProfile;
