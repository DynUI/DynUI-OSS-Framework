# @dynui/contracts

The four contracts the whole framework compiles against. These are the keystone:
everything else (the design-tool exporter, the generation service, the validator, the
native renderer, the experimentation layer) is an implementation detail behind one of
these seams. Keep the contracts stable; iterate freely behind them.

## The four contracts

| Contract | File | Seam | Owner |
|----------|------|------|-------|
| **SignalProfile** | `src/signal-profile.ts` | Who the user is, resolved at request time | Customer's Profile Adapter |
| **ComponentManifest** | `src/component-manifest.ts` | What may be composed + each component's *behavioral contract* (the IP) | Designers (contract) + developers (impl/data) |
| **UITree** | `src/ui-tree.ts` | What the model emits / the renderer consumes (server-driven UI) | Generated, then validated |
| **ModelProvider** | `src/model-provider.ts` | How a screen gets generated (pluggable LLM backend) | Configured per deployment |

## How they fit together (one request)

```
resolveProfile(userId, ctx) ── SignalProfile ──┐
                                                 ▼
ComponentManifest (+ constraints) ─► ModelProvider.generate() ─► UITree
                                                 │
                                   validate(UITree, manifest) ── ok? ─► render
                                                 │
                                   on error ─► repair or deterministic fallback
```

1. The **Profile Adapter** turns the customer's user id into a domain-neutral
   `SignalProfile` (PII can stay on their side).
2. The generation service hands the (filtered) `ComponentManifest`, the profile, the
   resolved data, and any experiment assignments to a `ModelProvider`.
3. The provider returns a `UITree` — references to manifest components only, never
   markup.
4. The tree is **validated against the manifest + global constraints**. Anything
   invalid (unknown component, missing required slot/data, constraint violation) is
   repaired or replaced with the deterministic fallback before it reaches a device.

## Why this shape

- **Bounded generation (safe L4):** the model can only compose registered components,
  so output stays on-brand and within a known, validator-checked vocabulary.
- **Domain-agnostic:** no domain fields in the core. Fitness lives entirely in
  namespaced keys + the `domain` pack — see `examples/fitness/`.
- **Pluggable model:** `ModelProvider` lets any model implementation plug in behind a
  single interface, without touching the rest of the system.
- **Attribution:** experiments target registered components/variants in the manifest,
  never raw model output.

## Worked fitness example

See `examples/fitness/` (Bevel-influenced):
- `manifest.example.json` — 9 components with full behavioral contracts + global rails.
- `signal-profile.examples.json` — the 3 archetypes (performance / wellness / social).
- `ui-tree.example.json` — a validated activity-detail screen generated for the
  performance athlete.

Open the manifest and a profile side by side and trace the `showWhen`/`hideWhen`
conditions against the profile's `archetype` and `behavior` values — that's the engine
in miniature.
