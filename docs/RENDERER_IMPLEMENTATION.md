# Renderer Implementation Guide

DynUI renders a validated `UITree`. The renderer should be boring on purpose:
component ids map to known native components, slot children resolve recursively,
and unknown or failing components degrade safely.

## Registry

Create a registry from manifest component ids to renderer functions:

```ts
type Renderer = (props: Record<string, unknown>, children: React.ReactNode) => React.ReactNode;
const registry: Record<string, Renderer> = {
  "recovery-score-card": RecoveryScoreCard,
};
```

## Compatibility Spec

Keep a `RendererSpec` beside the registry so CI can prove a manifest is renderable:

- supported component ids;
- supported variants;
- supported data bindings;
- supported slots;
- minimum renderer version, if applicable.

Run `checkRendererCompat` whenever a manifest changes.

## Render Gate

Only render trees that came from `generateScreen` with `validation.ok === true`, or
trees you have explicitly gated:

```ts
import { validateRenderableTree } from "@dynui/validate";

const result = validateRenderableTree(tree, manifest, {
  surface,
  profile,
  data,
  experiments,
});

if (!result.ok) showFallback();
```

## Failure Behavior

- Unknown component: render a visible safe fallback.
- Invalid slot composition: show the parent without the invalid child or show a
  safe fallback.
- Component throw: isolate with an error boundary.
- Missing optional data: render the component's empty state.
- Missing required data: suppress the component unless it is explicitly `neverHide`
  and backed by safe fallback data.

See `apps/fitness-app/src/renderer/` for a reference registry, nested-slot
resolution, compatibility checks, and per-component error boundaries.
