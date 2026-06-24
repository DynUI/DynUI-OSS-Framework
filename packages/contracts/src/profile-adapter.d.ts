import type { SignalProfile } from "./signal-profile.js";
/**
 * Request-time context passed into the adapter (cheap, always available). The
 * adapter combines this with persisted, derived signals to produce a SignalProfile.
 */
export interface ResolveContext {
    surface: string;
    timestamp?: string;
    locale?: string;
    timezone?: string;
    device?: {
        platform: "ios" | "android" | "web";
        theme?: "light" | "dark";
        reducedMotion?: boolean;
        viewport?: {
            width: number;
            height: number;
        };
    };
}
/**
 * ProfileAdapter — the seam between the platform and the customer's user data.
 *
 * `resolveProfile` answers "who is this user, right now" at request time; the
 * customer implements it against their own systems, so PII can stay on their side.
 * `ingestBehavior` persists aggregated engagement so it survives to the next
 * session and shapes future generation — the cross-session half of the loop.
 */
export interface ProfileAdapter {
    resolveProfile(userId: string, context: ResolveContext): Promise<SignalProfile>;
    ingestBehavior(userId: string, behaviorDelta: Record<string, number>): Promise<void>;
}
