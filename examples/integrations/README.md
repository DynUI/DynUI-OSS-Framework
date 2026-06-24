# Integration examples

These show how to wrap **existing** production systems behind DynUI's extension
seams. They are **examples, not dependencies** — nothing in `@dynui/*` imports them,
and none of them pulls in a vendor SDK (each models the vendor surface as a tiny
injected interface so it stays testable and dependency-free). Copy one into your app
and swap the mock client for the real SDK.

Every example keeps the framework's guarantees intact: it stays provider-neutral,
honors consent, never sends PII to a vendor, and keeps experiment assignment in the
assignment seam (never inside a model prompt).

## The extension seams

| Seam | Interface | Lives in | Example |
|------|-----------|----------|---------|
| **Experiment assignment** | `AssignmentAdapter` (`assign(exp, profile) → variantId \| null`) | `@dynui/experiments` | [`growthbook-assignment.ts`](growthbook-assignment.ts) — GrowthBook/Statsig/LaunchDarkly-style bucketing |
| **Profile store** | `ProfileAdapter` (`resolveProfile`, `ingestBehavior`, `setConsent?`) | `@dynui/contracts` | [`http-profile-adapter.ts`](http-profile-adapter.ts) — a custom HTTP profile service |
| **Telemetry sink** | `EventSink` (and `WarehouseExport`) | `@dynui/experiments` | [`warehouse-telemetry-sink.ts`](warehouse-telemetry-sink.ts) — Segment / warehouse forwarding |
| **Model provider** | `ModelProvider` (`generate(req)`) | `@dynui/contracts` | built in: `OpenAICompatibleModelProvider`, `AnthropicModelProvider` (optional SDK), or your own |

## What each example demonstrates

- **`growthbook-assignment.ts`** — defers bucketing to an external feature-flag engine
  while only forwarding the **anonymous** id plus coarse, non-sensitive attributes
  (segment, surface). It also rejects any variant the experiment doesn't declare, so a
  vendor misconfiguration can't inject an unknown variant.
- **`http-profile-adapter.ts`** — your service owns the PII; the framework only sees an
  anonymous `SignalProfile`. Consent is **deny-by-default**, archetype inference is
  gated on personalization consent, and `ingestBehavior` is a no-op without analytics
  consent — exactly like the reference `BaseProfileAdapter`.
- **`warehouse-telemetry-sink.ts`** — streams exposure/goal events to an external
  destination while keeping the dedup'd counts the analysis needs. A redaction guard
  throws if any PII property is ever attached, so "no raw PII to the warehouse" is
  enforced, not just intended.

Tests for all three (with mocked external calls) are in
[`tests/integrations.test.ts`](../../tests/integrations.test.ts).

## Anti-patterns these examples avoid

- A vendor SDK becoming a **required** dependency of a core install.
- An adapter **bypassing consent or validation**.
- Experiment assignment living **inside the model prompt** instead of the assignment
  adapter.
- Telemetry logging **raw PII**.
