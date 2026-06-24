# Privacy & Data Handling

DynUI personalizes UI from behavioral signals, so it is designed to touch as
little user data as possible and to enforce consent in code — not just docs. This
page is the contract between the framework and an app embedding it.

## What data the framework needs

The framework operates on a **`SignalProfile`** your Profile Adapter produces. It
needs only:

- an **anonymous id** (`subject.anonId`) — never a real user id, email, or name;
- **consent flags** (`personalization`, `analytics`, `modelTraining`);
- **request context** (surface, locale, timezone, device, session) — non-identifying;
- **derived signals**: archetype, namespaced `preferences` / `traits` / `behavior`.

PII stays on your side. The adapter maps your real user id to an `anonId` and never
persists the real id (see Anonymization).

## What data reaches the model

A **minimized projection only** (`@dynui/privacy` `minimizeProfileForPrompt`). The
prompt the model receives contains:

- the archetype (when personalization is consented), and
- only the specific signal values the candidate components' conditions reference,
  filtered through the **sensitivity allow-list**.

It explicitly does **not** contain the `anonId` (or any identifier), the raw
behavior map, or any field in a sensitive namespace. The server stamps the
authoritative `anonId` only onto an **internal copy** of the accepted tree (the one
returned to the app); the model's own output is never re-sent with an id attached.

This holds for **repair prompts** too. When a first attempt fails validation, its
output is handed back to the model to fix — but only after
`sanitizeTreeForPrompt` blanks `generatedFor.anonId` and scrubs any email/secret
from the prior tree. No initial *or* repair prompt sent to a provider contains the
`anonId`, an email-like string, or other identifiers.

The deterministic engine calls **no model at all** — running fallback-only sends
nothing to any provider.

## What is stored

The reference `BaseProfileAdapter` persists, keyed by `anonId`:

- aggregated `behavior` signals (numbers), `preferences`, `traits`, session count.

No raw events, no PII, no real user id. Cache keys (`buildCacheKey`) are PII-free by
construction: they include manifest version, surface, archetype segment, experiment
assignments, and coarse context — never the `anonId` or raw behavior values.

## Anonymization

Use a **salted-HMAC** anonymizer in production:

```ts
import { createHmacAnonymizer } from "@dynui/privacy";
const adapter = new BaseProfileAdapter(store, {
  anonymize: createHmacAnonymizer(process.env.DYNUI_ANON_SECRET!),
});
```

The same user + secret always maps to the same `anonId`; a different secret maps
differently (rotation / cross-deployment de-correlation). The fallback
`insecureAnonymizer` is non-secret and intended only for local dev/tests — the
adapter warns when it is used, and the anonymizer itself warns loudly when it runs
under a deployed `NODE_ENV`. Always pass `createHmacAnonymizer(secret)` in production.

## How consent affects behavior

| Consent flag | When `false` |
|---|---|
| `personalization` | Archetype, behavior, and trait targeting are disabled; generation produces a neutral screen. The validator rejects any archetype-restricted component (`consent-violation`). |
| `analytics` | Telemetry capture and behavior ingestion are disabled (`BatchingLogger` consent gate drops events; `ingestBehavior` no-ops). |
| `modelTraining` | Opt-in. When not granted, events are marked `trainable: false`; training/export flows must exclude them. |

### Who is responsible for what

- **Framework enforcement** (cannot be bypassed): the generator and validator read
  consent the same way everywhere. A `personalization:false` profile yields a
  neutral screen and the validator rejects archetype-restricted components
  (`consent-violation`); `analytics:false` drops events at the `BatchingLogger` gate
  and no-ops `ingestBehavior`; `modelTraining` is opt-in.
- **Reference adapter behavior** (`BaseProfileAdapter`): consent is explicit and
  configurable — set it via `setConsent`, `ResolveContext.consent`, or
  `opts.defaultConsent`. The packaged default is **`DENY_ALL_CONSENT`
  (deny-by-default)**: a user you never configured consent for stays neutral and
  non-personalized, with no analytics ingestion. `resolveProfile` writes the
  resolved consent onto the profile, and `ingestBehavior` reads the **stored**
  analytics flag when no explicit arg is passed. The permissive
  `DEV_DEFAULT_CONSENT` is opt-in for demos/local development only — never pass it in
  production.
- **App responsibility**: capture real consent from the user and supply it, and own
  deletion/export (below).

## Logs & errors

Run user-facing data through `@dynui/privacy` `redact` / `redactError` before it
reaches a log sink. Redaction masks user ids, emails, API keys, and sensitive
fields — including secrets embedded in upstream provider errors. The generation
orchestrator already redacts provider error messages.

## Deletion & export (app responsibility)

The framework stores only `anonId`-keyed derived signals, so:

- **Deletion**: delete the `ProfileStore` record for the user's `anonId`, and drop
  the mapping from your real user id → `anonId` on your side. Because the real id is
  never stored here, removing your mapping makes the framework's record
  unattributable.
- **Export**: read the `ProfileStore` record for the `anonId` and any telemetry you
  retain; none of it contains PII, so combine it with your own user record for a
  complete export.
- Honor `modelTraining: false` by excluding `trainable: false` events from any
  training/export pipeline.
