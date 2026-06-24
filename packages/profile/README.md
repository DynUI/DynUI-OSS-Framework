# @dynui/profile

Profile Adapter implementations — resolve a `SignalProfile` at request time and
persist aggregated behavior across sessions. PII stays customer-side.

## API
- `BaseProfileAdapter(store, { alpha?, anonymize?, signalModel?, defaultConsent? })`
  - `resolveProfile(userId, context)` — reads persisted behavior, infers the
    segment via the (configurable) `SignalModel`, stamps context, bumps the session.
    When `personalization` consent is false the resolved profile is **neutral**
    (no archetype).
  - `ingestBehavior(userId, delta, { analyticsConsent? })` — EMA-blends behavior;
    **no-ops when analytics consent is withheld**. If `analyticsConsent` is omitted
    it reads the user's **stored** consent (then the configured default).
  - `setConsent(userId, consent)` — persist `{ personalization, analytics,
    modelTraining }` so it shapes future resolve/ingest calls.
- Stores: `InMemoryProfileStore`, `FileProfileStore` (implement `ProfileStore` for
  your own DB). `anonIdFor` is a dev-only convenience; pass a salted-HMAC
  `anonymize` (see `@dynui/privacy`) in production.

## Consent

Consent is **explicit and configurable** — the reference adapter does not silently
assume it. Three ways to supply it (precedence, highest first):

1. `ResolveContext.consent` — pass at request time; it is persisted for next time.
2. `setConsent(userId, consent)` — persist it ahead of time.
3. `opts.defaultConsent` — the fallback when neither of the above is set.

If you supply none, the adapter uses **`DENY_ALL_CONSENT` (deny-by-default)**
(`{ personalization: false, analytics: false, modelTraining: false }`) — a user you
never configured consent for stays neutral and non-personalized, with no analytics
ingestion. The permissive `DEV_DEFAULT_CONSENT`
(`{ personalization: true, analytics: true, modelTraining: false }`) is **opt-in for
demos/local development only** — pass it explicitly via `opts.defaultConsent`, and
never in production. `modelTraining` is opt-in: it is only true when explicitly set
true.

Only `anonId`-keyed derived signals (and the consent flags) are stored — never the
real user id or PII.
