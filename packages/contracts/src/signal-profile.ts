import type { JsonValue } from "./json.js";

/**
 * SignalProfile — the canonical, DOMAIN-NEUTRAL description of "who is this user,
 * right now" that the generation service conditions on.
 *
 * It is produced at request time by a customer-implemented Profile Adapter
 * (`resolveProfile(userId, context) -> SignalProfile`). Customer PII can stay on
 * their side: the profile carries an anonymous id plus derived signals, not names
 * or emails.
 *
 * Domain specifics (fitness, commerce, news, ...) are NOT new top-level fields —
 * they live as namespaced keys inside `preferences`, `traits`, and `behavior`
 * (e.g. "fitness.primaryMetric", "fitness.engagement.charts.openRate"). This keeps
 * the core schema stable while domain packs extend it freely.
 */
export interface SignalProfile {
  schemaVersion: string; // e.g. "signal-profile/1.0"

  /** Anonymous subject. Never put PII here. */
  subject: {
    anonId: string; // stable, opaque per-user id (hash of the real id)
  };

  /** What the user has allowed. Generation/training must honor these. */
  consent: {
    personalization: boolean; // may we tailor the UI at all?
    analytics: boolean; // may we collect behavioral events?
    modelTraining: boolean; // may anonymized outcomes be used to improve the model?
  };

  /** Request-time context. Cheap, always available, no history required. */
  context: {
    timestamp: string; // ISO 8601
    locale: string; // BCP-47, e.g. "en-GB"
    timezone: string; // IANA, e.g. "Europe/London"
    surface: string; // which screen is being requested, e.g. "activity-detail"
    device: {
      platform: "ios" | "android" | "web";
      theme?: "light" | "dark";
      reducedMotion?: boolean; // accessibility hint
      viewport?: { width: number; height: number };
    };
    session: {
      isNew: boolean; // first-ever session (cold start)
      count: number; // lifetime session count
    };
  };

  /**
   * EXPLICIT preferences the user set themselves (onboarding, settings).
   * Namespaced keys. Examples:
   *   "ui.density": "compact" | "comfortable"
   *   "fitness.primaryMetric": "pace" | "heartRate" | "power"
   */
  preferences: Record<string, JsonValue>;

  /**
   * DERIVED traits computed from history (not directly set by the user).
   * Namespaced. Examples: "fitness.experienceLevel": "advanced".
   */
  traits: Record<string, JsonValue>;

  /**
   * The headline derived classification that drives most divergence.
   * Soft, probabilistic — generation should treat low confidence cautiously
   * (lean on safe defaults).
   */
  archetype?: {
    primary: string; // e.g. "performance" | "wellness" | "social"
    confidence: number; // 0..1
    secondary?: string;
  };

  /**
   * Aggregated BEHAVIORAL signals as a flat map of namespaced metric -> number.
   * Flat-map (rather than nested) so behavioral contracts can reference any signal
   * by a single string path. Examples:
   *   "fitness.engagement.charts.openRate": 0.71
   *   "fitness.engagement.social.kudosRate": 0.05
   *   "fitness.training.weeklyLoadKm": 64
   */
  behavior: Record<string, number>;

  /**
   * Experiment/segment assignments resolved upstream (by the experimentation
   * engine) and passed through so generation can honor them.
   */
  cohorts?: string[];
}
