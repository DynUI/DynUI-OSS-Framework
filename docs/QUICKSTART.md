# Quickstart & Adoption Guide

How to add DynUI to an app, from zero to a personalized, safe screen. Every
step works with **no model** (the deterministic engine); enabling a model is the
last, optional step.

## 0. Install & verify

```bash
npm install
npm test && npm run typecheck && npm run build
npm run eval:contracts && npm run eval:generation   # fixture + generation evals
npm run demo:no-model        # a non-fitness (news) domain, zero model calls
```

## 1. Author a manifest

A `ComponentManifest` is your component vocabulary plus each component's behavioral
contract. Author it by hand or export it from Figma (step 6). Minimum per component:
`id`, `version` (semver), `category`, a real `description`, `variants`, `data`
requirements, and a `contract` (`audience`, `surfaces`, `priority`). See
`examples/news/manifest.json` for a small, complete example.

Validate and lint it at runtime:

```ts
import { migrateManifest } from "@dynui/contracts";
import { lintManifest, lintPassed } from "@dynui/figma";

const manifest = migrateManifest(rawJson);     // schema + version + compat, fails closed
if (!lintPassed(lintManifest(manifest))) throw new Error("fix manifest lint errors");
```

## 2. Implement a Profile Adapter

Map your real user id to an anonymous `SignalProfile`. PII stays on your side.

```ts
import { BaseProfileAdapter, InMemoryProfileStore, FileProfileStore } from "@dynui/profile";
import { createHmacAnonymizer } from "@dynui/privacy";

const adapter = new BaseProfileAdapter(new FileProfileStore("./profiles"), {
  anonymize: createHmacAnonymizer(process.env.DYNUI_ANON_SECRET!), // salted HMAC in prod
  // The adapter ALREADY defaults to deny-by-default consent (DENY_ALL_CONSENT), so a
  // user you never configured consent for stays neutral and non-personalized. You can
  // set defaultConsent explicitly to be self-documenting, but you don't have to —
  // never pass the permissive DEV_DEFAULT_CONSENT in production.
});
```

> Always use `createHmacAnonymizer(secret)` in production. The non-secret
> `insecureAnonymizer` is for local dev/tests only and warns loudly when used under a
> deployed `NODE_ENV`.

## 3. Capture consent BEFORE resolving

Consent is explicit and configurable. Persist the user's choices once (or pass them
at request time) — the reference adapter does not silently assume them:

```ts
// Persist ahead of time …
await adapter.setConsent(userId, { personalization: true, analytics: true, modelTraining: false });

// … or supply at request time (takes precedence, and is persisted):
const profile = await adapter.resolveProfile(userId, {
  surface: "activity-detail", device,
  consent: { personalization: true, analytics: true, modelTraining: false },
});
```

Consent then enforces everywhere: with `personalization:false` the resolved profile
is neutral (no archetype) and generation returns a neutral screen; with
`analytics:false`, telemetry and `ingestBehavior` no-op (even without an explicit
`analyticsConsent` arg — it reads the stored flag). `modelTraining` is opt-in. The
model only ever receives a minimized projection (no ids, no raw behavior, no
sensitive fields). See [PRIVACY.md](PRIVACY.md).

## 4. Generate a screen (deterministic fallback only)

```ts
import { generateScreen, HeuristicModelProvider } from "@dynui/generate";

const res = await generateScreen(new HeuristicModelProvider(), {
  surface: "activity-detail", profile, manifest, constraints: manifest.constraints,
  experiments: [], data,
});

if (res.unrenderable) {
  // EXPLICIT non-renderable result: a neverHide component needs baseline data that
  // is missing and no fallbackData covers it. validation.ok is false here; do NOT
  // render res.tree — show your own empty/error state, or supply options.fallbackData.
} else {
  // Normal path: res.validation.ok is true and res.tree is safe to render.
  // res.diagnostics describes how it was produced (first-try / repaired / fallback).
}
```

The contract is precise: **`generateScreen` returns either a valid renderable tree
(`unrenderable` falsy, `validation.ok === true`) or an explicit non-renderable
result (`unrenderable === true`, `validation.ok === false`)**. It never returns a
renderable-looking tree that is actually invalid. To keep `neverHide` components
renderable when their baseline data may be missing, pass `options.fallbackData` with
safe placeholder values. This path calls no model.

`generateScreen` already validates internally with full context, so `res.tree` is
safe once you've checked `res.validation.ok`/`res.unrenderable`. If you ever obtain a
tree from another source (a cache, a custom pipeline) and render it directly, gate it
with the full render validator first:

```ts
import { validateRenderableTree } from "@dynui/validate";

// THE RENDER GATE. validateTreeStructure(tree, manifest) is structural-only and is
// NOT sufficient before render — it can't see consent, data, or the surface.
const v = validateRenderableTree(tree, manifest, { surface, profile, data, experiments });
if (!v.ok) { /* do NOT render — show empty/error state */ }
```

## 5. Implement a renderer registry

Map component ids to native components, and declare a `RendererSpec` per component
so the renderer↔manifest compatibility check can prove a manifest is renderable
before your app receives a tree. See `apps/fitness-app/src/renderer/` —
`registry.tsx` (components), `registry-contract.ts` (`checkRendererCompat`),
`resolve.ts` (nested-slot resolution), `ErrorBoundary.tsx` (per-component isolation).

## 6. Export from Figma (optional)

Designers annotate each component's Figma **description** with a fenced ` ```dynui `
JSON block; file-level config lives in a `@dynui/config` node. Validate before use:

```ts
import { validateFigmaFile, extractFromFigmaFile, figmaToManifest } from "@dynui/figma";

const issues = validateFigmaFile(figmaFileJson);  // node-specific errors
const manifest = figmaToManifest(extractFromFigmaFile(figmaFileJson));
```

## 7. Configure experiments

The unit under test is a registered component/variant (a canary), so outcomes
attribute cleanly. The engine only recommends promote/rollback when assignment,
exposure, sample size, runtime, SRM, and guardrail checks all pass.

```ts
import { ComponentExperimentEngine, InMemoryEventSink } from "@dynui/experiments";
const engine = new ComponentExperimentEngine(experiments, new InMemoryEventSink());
const assignments = engine.assignmentsFor(profile);   // pass into generateScreen
const result = engine.analyze("exp.id");              // recommendation + guardrails
```

## 8. Enable a model provider (optional)

```ts
import { OpenAICompatibleModelProvider, AnthropicModelProvider } from "@dynui/generate";
const provider = new AnthropicModelProvider({ model: "claude-opus-4-8" });
const res = await generateScreen(provider, req, { maxRepairs: 1, timeoutMs: 20000 });
```

A timeout, throw, malformed, or invalid output never blocks render: it yields either
a valid fallback tree or an explicit non-renderable result (`res.unrenderable`,
`res.validation.ok === false`) — branch on `res.unrenderable` (see step 4). No render
path depends on model success, and live providers must run behind a `timeoutMs`
budget. Live model generation is not request-time-safe by default (~15s p95); use
deterministic or cached trees on the request-time path.

## Production deployment checklist

- [ ] Manifest is schema-valid, lints clean, renderer-compatible, and **diffed**
      against the last accepted manifest (`diffManifest`) — block on breaking diffs.
- [ ] `DYNUI_ANON_SECRET` set; Profile Adapter uses a salted-HMAC anonymizer.
- [ ] Consent flags populated on every profile; verify no-consent → neutral.
- [ ] Model provider (if any) has a `timeoutMs` budget; fallback path tested.
- [ ] Telemetry sink wired; exposure recorded only for rendered components.
- [ ] Experiment guardrails (min samples, min runtime, SRM, guardrail metrics) set.
- [ ] Logs run through `redact`; cache keys verified PII-free.
- [ ] CI runs install/build/typecheck/test/eval:contracts/eval:generation/lint.
