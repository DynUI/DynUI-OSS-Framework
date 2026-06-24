import type { ProfileAdapter, ResolveContext, SignalModel, SignalProfile } from "@dynui/contracts";
import { inferArchetype } from "@dynui/telemetry";
import { type Anonymizer, insecureAnonymizer } from "@dynui/privacy";
import { emptyStored, type ProfileStore } from "./store.js";

/**
 * Back-compat alias. NON-secret (FNV-1a) — fine for local dev/tests, but production
 * should pass a salted-HMAC `anonymize` to the adapter (see @dynui/privacy
 * createHmacAnonymizer). The real user id is never persisted either way.
 */
export const anonIdFor: Anonymizer = insecureAnonymizer;

export type Consent = SignalProfile["consent"];

/**
 * Production-safe, deny-by-default consent. This is the {@link BaseProfileAdapter}
 * default: a user whose consent has not been configured (no stored consent, no
 * `ResolveContext.consent`, no `opts.defaultConsent`) is treated as non-consenting —
 * a neutral, non-personalized profile with no analytics ingestion. Production code
 * should set real consent explicitly via `setConsent` or `ResolveContext.consent`.
 */
export const DENY_ALL_CONSENT: Consent = {
  personalization: false,
  analytics: false,
  modelTraining: false,
};

/**
 * Permissive consent for DEMOS and local development ONLY. It enables
 * personalization/analytics so demos work out of the box (but keeps `modelTraining`
 * opt-in). It is NOT the adapter default — demos must import and pass it explicitly
 * (`new BaseProfileAdapter(store, { defaultConsent: DEV_DEFAULT_CONSENT })`), which
 * keeps production-facing code from silently relying on permissive consent.
 */
export const DEV_DEFAULT_CONSENT: Consent = {
  personalization: true,
  analytics: true,
  modelTraining: false,
};

const round2 = (n: number) => Math.round(n * 100) / 100;
let warnedInsecure = false;

/**
 * Reference Profile Adapter backed by a ProfileStore.
 *
 *  - resolveProfile: reads persisted behavior, infers the archetype, stamps the
 *    request-time context, and bumps the session counter.
 *  - ingestBehavior: blends a session's aggregated signals into the stored profile
 *    (exponential moving average) — but ONLY when analytics consent is granted.
 *
 * Pass a salted-HMAC (or caller-provided) `anonymize` in production; the default
 * is a non-secret hash suitable only for dev/tests.
 */
export class BaseProfileAdapter implements ProfileAdapter {
  private readonly anonymize: Anonymizer;
  private readonly defaultConsent: Consent;

  constructor(
    private readonly store: ProfileStore,
    private readonly opts: {
      alpha?: number;
      anonymize?: Anonymizer;
      signalModel?: SignalModel;
      /**
       * Consent used when neither stored nor request-time consent is available.
       * Defaults to {@link DENY_ALL_CONSENT} (production-safe). Demos opt into
       * permissive behavior by passing {@link DEV_DEFAULT_CONSENT}; production code
       * should supply real consent via `setConsent` / `ResolveContext.consent`.
       */
      defaultConsent?: Consent;
    } = {},
  ) {
    this.anonymize = opts.anonymize ?? insecureAnonymizer;
    this.defaultConsent = opts.defaultConsent ?? DENY_ALL_CONSENT;
    if (!opts.anonymize && !warnedInsecure) {
      warnedInsecure = true;
      console.warn(
        "[dynui] BaseProfileAdapter is using the non-secret default anonymizer. " +
          "Pass a salted-HMAC anonymize() (see @dynui/privacy) in production.",
      );
    }
  }

  /** Persist this user's consent so it shapes future resolve/ingest calls. */
  async setConsent(userId: string, consent: Consent): Promise<void> {
    const anonId = this.anonymize(userId);
    const stored = this.store.load(anonId) ?? emptyStored();
    this.store.save(anonId, { ...stored, consent });
  }

  async resolveProfile(userId: string, context: ResolveContext): Promise<SignalProfile> {
    const anonId = this.anonymize(userId);
    const stored = this.store.load(anonId) ?? emptyStored();

    // Consent precedence: request-time (and persisted) > stored > configured default.
    const persistedConsent = context.consent ?? stored.consent;
    const consent = persistedConsent ?? this.defaultConsent;

    const isNew = stored.sessionCount === 0;
    const sessionCount = stored.sessionCount + 1;
    this.store.save(anonId, {
      ...stored,
      sessionCount,
      lastSeen: new Date().toISOString(),
      ...(persistedConsent ? { consent: persistedConsent } : {}),
    });

    return {
      schemaVersion: "signal-profile/1.0",
      subject: { anonId },
      consent,
      context: {
        timestamp: context.timestamp ?? new Date().toISOString(),
        locale: context.locale ?? "en-GB",
        timezone: context.timezone ?? "Europe/London",
        surface: context.surface,
        device: context.device ?? { platform: "web" },
        session: { isNew, count: sessionCount },
      },
      preferences: stored.preferences,
      traits: stored.traits,
      behavior: stored.behavior,
      // Personalization consent gates archetype inference: a non-consenting user
      // is treated as neutral (no archetype), matching the generation/validator path.
      archetype: consent.personalization
        ? inferArchetype(stored.behavior, this.opts.signalModel)
        : undefined,
      cohorts: [],
    };
  }

  async ingestBehavior(
    userId: string,
    behaviorDelta: Record<string, number>,
    opts?: { analyticsConsent?: boolean },
  ): Promise<void> {
    const anonId = this.anonymize(userId);
    const stored = this.store.load(anonId) ?? emptyStored();

    // Consent gate: an explicit opts flag wins; otherwise read STORED analytics
    // consent (falling back to the configured default). No behavior is ingested
    // when analytics consent is withheld.
    const analyticsConsent =
      opts?.analyticsConsent ?? stored.consent?.analytics ?? this.defaultConsent.analytics;
    if (!analyticsConsent) return;

    const alpha = this.opts.alpha ?? 0.5;
    const behavior = { ...stored.behavior };
    for (const [k, v] of Object.entries(behaviorDelta)) {
      behavior[k] = behavior[k] == null ? round2(v) : round2(behavior[k] * (1 - alpha) + v * alpha);
    }
    this.store.save(anonId, { ...stored, behavior });
  }
}
