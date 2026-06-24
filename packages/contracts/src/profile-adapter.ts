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
    viewport?: { width: number; height: number };
  };
  /**
   * Consent for this user, supplied at request time. When present it takes
   * precedence over any stored consent and is persisted for future sessions
   * (so a later `ingestBehavior` honors it). When omitted, the adapter falls back
   * to stored consent, then to its configured default.
   */
  consent?: SignalProfile["consent"];
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
  /**
   * Persist aggregated behavior. Implementations MUST NOT ingest when
   * `opts.analyticsConsent` is false (the analytics consent gate).
   */
  ingestBehavior(
    userId: string,
    behaviorDelta: Record<string, number>,
    opts?: { analyticsConsent?: boolean },
  ): Promise<void>;
  /**
   * Persist this user's consent so it shapes future `resolveProfile` /
   * `ingestBehavior` calls. Optional: adapters may instead accept consent through
   * `ResolveContext`. The reference `BaseProfileAdapter` implements it.
   */
  setConsent?(userId: string, consent: SignalProfile["consent"]): Promise<void>;
}
