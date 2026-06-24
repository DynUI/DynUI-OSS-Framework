# @dynui/generate

Composes a `UITree` for a user. Two providers implement the same `ModelProvider`
contract; the orchestrator validates every output against the full safety boundary
and **always falls back deterministically**, so a device never blocks on or breaks
because of the model.

### Provider SDKs are optional

This package has **no hard dependency on any model SDK**. The deterministic engine
(`HeuristicModelProvider`) and the fallback need no provider at all. Bring your own:

- `HeuristicModelProvider` — deterministic, no key, no SDK. Also the fallback engine.
- `OpenAICompatibleModelProvider` — plain `fetch`, no SDK (OpenAI, OpenRouter, any
  OpenAI-compatible endpoint).
- `AnthropicModelProvider` — uses `@anthropic-ai/sdk`, declared as an **optional peer
  dependency** and loaded lazily on first `generate()`. Install it only if you use
  this provider; otherwise `@dynui/generate` installs and runs without it.
- A **custom `ModelProvider`** — implement `generate()` and pass it to
  `generateScreen`; no core changes needed.

```ts
const result = await generateScreen(provider, req, { maxRepairs: 1, policy });
// { tree, validation, usedFallback, unrenderable?, attempts, usage, diagnostics }
```

### The fallback contract (truthful, not just "always valid")

`generateScreen` returns one of exactly two shapes:

- **renderable** — `unrenderable` is falsy and `validation.ok === true`. Safe to render.
- **non-renderable** — `unrenderable === true` and `validation.ok === false`. The
  deterministic fallback could not be made valid (a `neverHide` component needs
  baseline data that is missing and no `options.fallbackData` covers it). Callers
  MUST branch on `unrenderable` and show their own empty/error state — the framework
  never hands back a renderable-looking tree that is actually invalid.

To keep `neverHide` components renderable when baseline data may be missing, pass
`options.fallbackData` (safe placeholder values for required keys); real `data`
always wins over a fallback value.

## Provider hardening

No app render path depends on model success. `generateScreen` enforces:

- **Latency budget** — `{ timeoutMs }` races each provider call against an
  `AbortController`; exceeding it cancels and falls back.
- **Normalization before validation** — `normalizeTree` strips unknown node fields,
  and rejects unknown node types / oversized trees (`{ limits }`) → fallback.
- **Repair policy** — up to `maxRepairs` attempts; the repair prompt carries only
  the failing validation errors, and every attempt is re-validated against the full
  safety boundary (consent/experiment rules can't be bypassed by repair).
- **Observable diagnostics** — every result includes `diagnostics`:
  `{ outcome: "first-try"|"repaired"|"fallback", attempts, latencyMs,
  validationErrorCodes, fallbackReason }`. Provider errors are redacted.

`npm run eval:generation` is the model eval suite: heuristic, invalid, malformed,
throwing, and slow/timeout providers (all must fall back to a valid tree). Set
`DYNUI_EVAL_LIVE=1` with a provider key to also run the live model budget checks
(first-try rate, p95 latency, tokens).

### Generation modes & latency budgets

Live model generation is **not** request-time-safe by default — measured p95 is
~15–17s. Pick a mode and budget accordingly:

| Mode | Latency expectation | How |
|------|---------------------|-----|
| **request-time** | tight (sub-second–few seconds) | use deterministic generation or a **cached** tree; never block render on a live call |
| **session-boundary / background / cache-warming** | seconds are fine | run the live model *before* render, behind a `timeoutMs` budget |
| **deterministic-only** | instant | `HeuristicModelProvider`, no model |

Always pass `{ timeoutMs }` with a live provider so a slow/hung model falls back
instead of blocking. The live eval enforces env-configurable budgets — to assert
request-time safety, tighten them:

```bash
DYNUI_LIVE_P95_BUDGET_MS=3000     # default 20000 (background mode)
DYNUI_LIVE_MIN_FIRST_TRY_RATE=0.8 # default 0.8
DYNUI_LIVE_MAX_FALLBACK_RATE=0.2  # default 0.2
DYNUI_LIVE_TIMEOUT_MS=3000        # default 30000 — per-call timeout in examples
```

By default the live checks are **skipped** (CI stays deterministic). Set
`DYNUI_EVAL_LIVE=1` with an API key to enforce live-provider latency and quality
budgets; exceeding a budget fails the eval non-zero.

## The deterministic engine (`composeHeuristic`)

The no-LLM provider AND the fallback engine. It is production-grade: **valid,
deterministic, privacy-safe, and domain-configurable**. Composition runs as
explicit stages:

1. **eligibility** — hard gates only: surface, audience (consent-aware), hard
   `showWhen` / `hideWhen`, experiment gates, and required-data presence. A
   component whose required data is missing is suppressed — unless it is
   `neverHide`, in which case it is kept. The orchestrator then fills required keys
   from `options.fallbackData` if supplied; if a `neverHide` component still lacks
   required data, the result is returned as an explicit non-renderable result
   (`unrenderable: true`) rather than a renderable invalid tree.
2. **scoring** — base `priority` plus ranking nudges from *weighted* `showWhen`
   conditions (each recorded with its score delta).
3. **layout** — deterministic sort, pinning, optional `maxModules` cap (always
   retaining `neverHide`/`pinned`), and above-the-fold split.
4. **variant** — density variant selection.
5. **explanation** — a structured `NodeExplanation` per component.

Output is byte-stable for fixed inputs (only `meta.generatedAt` varies).

### Configurable ranking — `RankPolicy`

```ts
composeHeuristic(req, {
  signalWeights: { "archetype.primary": 1.5 }, // per-signal multiplier
  weightScale: 10,        // score per unit of matched showWhen weight
  minConfidence: 0.5,     // below this archetype confidence → cold start (neutral)
  maxModules: 6,          // hard cap (neverHide/pinned always retained)
  duplicatePolicy: "first-wins",
});
```

### Structured explanations — `NodeExplanation`

Every component records why it is there, distinguishing the four reason kinds:
`eligibility` (hard gates passed), `nudges` (ranking deltas), `constraints`
(pinned/neverHide/above-fold placement), and `fallbackReason` (neutral/forced).

### Cache keys — `buildCacheKey`

`meta.cacheKey` is a deterministic, **PII-free** function of manifest version,
surface, archetype segment, experiment assignments, and coarse context dimensions
(platform/theme/reduced-motion/locale). It deliberately excludes the `anonId` and
the raw behavior map, so two users in the same segment collide (shareable cache)
and no identifier leaks into the key.
