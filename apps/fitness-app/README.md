# Fitness app — server-driven UI renderer

An Expo / React Native app that renders a generated `UITree` by mapping its nodes
to native components. It is a **pure renderer**: it consumes pre-generated screens
and knows nothing about archetypes or personalization.

## How it works

```
assets/screens.json  ──►  UITreeRenderer  ──►  registry[componentId]  ──►  native UI
   (generated trees)        (walks tree,         (Bevel-styled RN
                             resolves bindings)    components)
```

- `src/renderer/resolve.ts` — pure tree-walk + data-binding resolution (no RN;
  unit-testable). **Slots are preserved as nested children**, not flattened — a
  component's slot children render inside its layout (true composition).
- `src/renderer/registry.tsx` — the fitness components plus a small composition demo
  (`dashboard-panel` placing children into `body`/`footer` slots).
- `src/renderer/registry-contract.ts` — RN-free **renderer registry contract**
  (`RendererSpec` + `checkRendererCompat`): which component ids / variants / slots /
  data / component versions the renderer supports. Run at build time by
  `npm run gen:screens` — screens are only emitted when the renderer can render them.
- `src/renderer/ErrorBoundary.tsx` — per-component error boundary: one component
  throwing renders a safe, observable fallback (component id + manifest version)
  instead of crashing the whole screen.
- `src/renderer/UITreeRenderer.tsx` — maps nodes → components, nests slots, wraps each
  in the error boundary; unknown ids and invalid slot structures render a visible,
  safe placeholder.
- `App.tsx` — switch between archetypes (plus a "Compose" tab demonstrating nested
  composition) and toggle the "why was this shown?" reasons.

## Renderer compatibility

`checkRendererCompat(manifest, rendererSpecs)` proves a manifest is renderable
before the app receives a tree. It fails on a missing renderer, an unsupported
variant or required slot, a required data key the renderer doesn't consume, or a
component-version mismatch. The RN-free parts (`resolve`, `registry-contract`) are
covered by `tests/renderer.test.ts` at the repo root.

## Regenerating the screens

The trees in `assets/screens.json` are produced by the generation engine. From the
repo root:

```
npm run gen:screens
```

## Running

```
cd apps/fitness-app
npm install
npx expo start        # then press i (iOS), a (Android), or w (web)
```
