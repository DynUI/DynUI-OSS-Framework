/**
 * EXAMPLE — not a dependency, not imported by any @dynui/* package.
 *
 * A custom `ProfileAdapter` backed by an external HTTP profile service. This is the
 * "bring your own profile store" seam: your service owns the PII; DynUI only
 * ever sees an anonymous `SignalProfile`.
 *
 * Consent is enforced the same way the reference adapter enforces it:
 *   - deny-by-default: a user with no known consent is neutral (no archetype);
 *   - `ingestBehavior` is a NO-OP unless analytics consent is granted.
 *
 * The `HttpClient` is injected so this example needs no real network and is trivial
 * to test with a mock.
 */
import type {
  ProfileAdapter,
  ResolveContext,
  SignalProfile,
} from "@dynui/contracts";
import type { Anonymizer } from "@dynui/privacy";

type Consent = SignalProfile["consent"];

const DENY: Consent = { personalization: false, analytics: false, modelTraining: false };

/** What the adapter expects back from your profile service (already PII-free). */
export interface RemoteProfile {
  behavior: Record<string, number>;
  preferences?: Record<string, unknown>;
  traits?: Record<string, unknown>;
  consent?: Consent;
}

/** Minimal injected HTTP surface. Wrap `fetch` or your service client here. */
export interface HttpClient {
  getProfile(anonId: string): Promise<RemoteProfile | null>;
  putBehavior(anonId: string, delta: Record<string, number>): Promise<void>;
}

export interface HttpProfileAdapterOptions {
  /** Map a real user id → opaque anonId. Use createHmacAnonymizer(secret) in prod. */
  anonymize: Anonymizer;
  /** Infer an archetype from behavior (e.g. inferArchetype / inferSegment). */
  inferArchetype: (behavior: Record<string, number>) => SignalProfile["archetype"];
}

export class HttpProfileAdapter implements ProfileAdapter {
  constructor(
    private readonly http: HttpClient,
    private readonly opts: HttpProfileAdapterOptions,
  ) {}

  async resolveProfile(userId: string, context: ResolveContext): Promise<SignalProfile> {
    const anonId = this.opts.anonymize(userId);
    const remote = await this.http.getProfile(anonId);

    // Consent precedence: request-time > stored > deny-by-default.
    const consent = context.consent ?? remote?.consent ?? DENY;
    const behavior = remote?.behavior ?? {};

    return {
      schemaVersion: "signal-profile/1.0",
      subject: { anonId },
      consent,
      context: {
        timestamp: context.timestamp ?? new Date().toISOString(),
        locale: context.locale ?? "en-US",
        timezone: context.timezone ?? "UTC",
        surface: context.surface,
        device: context.device ?? { platform: "web" },
        session: { isNew: remote == null, count: 1 },
      },
      preferences: (remote?.preferences ?? {}) as SignalProfile["preferences"],
      traits: (remote?.traits ?? {}) as SignalProfile["traits"],
      behavior,
      // Personalization consent gates archetype inference.
      archetype: consent.personalization ? this.opts.inferArchetype(behavior) : undefined,
      cohorts: [],
    };
  }

  async ingestBehavior(
    userId: string,
    behaviorDelta: Record<string, number>,
    opts?: { analyticsConsent?: boolean },
  ): Promise<void> {
    // Consent gate: an explicit flag wins; otherwise read the stored remote consent.
    const anonId = this.opts.anonymize(userId);
    let analyticsConsent = opts?.analyticsConsent;
    if (analyticsConsent == null) {
      const remote = await this.http.getProfile(anonId);
      analyticsConsent = remote?.consent?.analytics ?? DENY.analytics;
    }
    if (!analyticsConsent) return; // NO-OP without analytics consent
    await this.http.putBehavior(anonId, behaviorDelta);
  }
}
