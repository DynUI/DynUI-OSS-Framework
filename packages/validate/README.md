# @dynui/validate

The **safety boundary**. A generated (or fallback) `UITree` only reaches a device
if it passes the **render gate**, `validateRenderableTree`. The model may emit
anything; this is what makes bounded generation shippable.

```ts
import { validateRenderableTree, type RenderableValidateContext } from "@dynui/validate";

// THE RENDER GATE — call this before rendering. context is required.
const result = validateRenderableTree(tree, manifest, {
  surface, profile, data, experiments,
});
// { ok: boolean, errors: { code, nodePath, message }[] }
if (!result.ok) { /* do NOT render — show your empty/error state */ }
```

Every error carries a **stable `code`**, a **`nodePath`** (JSON pointer to the
offending node), and an actionable **`message`**.

## Entry points

| Function | Use | Enforces |
|----------|-----|----------|
| `validateRenderableTree(tree, manifest, context)` | **before render (production)** | structure **plus** request-relative rules: surface/subject match, surface/audience/consent eligibility, hard `showWhen`/`hideWhen`, data existence + types, accessibility, experiment-assignment honesty, fallback-flag honesty, stable anchors |
| `validateTreeStructure(tree, manifest)` | authoring / lint | structure only: vocabulary, slots, variants, data bindings, props, layout rails, experiment gates — **derivable from the manifest alone** |

> **Use `validateRenderableTree` as your render gate.** `validateTreeStructure` is a
> structural check only — it cannot see consent, the resolved data bundle, or the
> requested surface, so a tree can pass it while still being unsafe to render. The
> generation orchestrator (`generateScreen`) always validates with full context.

`validateRenderableTree` takes a **required** `RenderableValidateContext` — all of
`surface`, `profile`, `data`, and `experiments` must be present (use `{}` for empty
data and `[]` for no experiments). Omitting any of them **throws**, because each one
switches on a class of safety check; the gate refuses to validate a tree against a
weaker boundary than the caller intends.

`validateTree(tree, manifest, context?)` is the underlying function the two wrappers
delegate to (its `context` is optional, supporting the manifest-only mode); it is
retained for backward compatibility, but new code should prefer the named entry points
above so intent is explicit.

## Enforced rules → error codes

| Area | Codes |
|------|-------|
| Structure | `unknown-component`, `unknown-variant`, `unknown-slot`, `slot-category-mismatch`, `missing-required-slot`, `root-not-screen`, `mixed-root-children` |
| Root & metadata | `surface-mismatch`, `subject-mismatch`, `experiments-mismatch`, `fallback-flag-mismatch` |

> **Root shape:** a screen's children are **all sections or all components, never a
> mix**. A mixed root is rejected with `mixed-root-children` — otherwise the renderer
> would resolve only the sections and silently drop the direct components.
| Eligibility | `surface-ineligible`, `audience-ineligible`, `show-when-failed`, `hide-when-violated`, `consent-violation` |
| Data | `missing-required-data`, `unknown-data-binding`, `data-not-in-bundle`, `data-type-mismatch` |
| Props | `prop-not-declared`, `prop-type-mismatch`, `unsafe-prop-value` |
| Layout & safety rails | `constraint-violation` (neverHide / pinned / maxModulesAboveFold / category allow-list / experiment gate), `max-depth-exceeded`, `max-components-exceeded`, `duplicate-component`, `stable-anchor-violation` |
| Accessibility (where declared) | `a11y-missing-label`, `a11y-reduced-motion`, `a11y-missing-text-fallback` |

`neverHide` components are exempt from audience/consent/`showWhen`/`hideWhen`
eligibility — they must always render — but are still type/structure-checked.

## Advisory fields (NOT enforced by the validator)

These influence ranking, telemetry, or provenance — not safety, eligibility,
consent, data, or renderability — so the validator does not reject on them:

- `contract.priority`, `contract.prominence` — deterministic ranking inputs
  (see `@dynui/generate` composition).
- `contract.goals`, `engagementSignal` — experiment/telemetry attribution.
- `intent`, `figmaNodeId`, `registry.domain`, `tokens` — metadata / provenance /
  theming hints consumed by the renderer.

Weighted `showWhen` conditions are advisory (ranking nudges); only **unweighted**
`showWhen` conditions are hard gates. `hideWhen` always suppresses.
