# Browser example

A runnable, browser-rendered DynUI example. It takes **one activity — a morning
run — and composes it three ways**, for a performance-, wellness-, or
social-oriented athlete, using the deterministic engine. No model credentials, no
hosted service, no account. Generation runs in Node (DynUI's server-driven-UI
model); the browser only renders the validated `UITree` it receives.

[![Open in GitHub Codespaces](https://github.com/codespaces/badge.svg)](https://codespaces.new/DynUI/DynUI-OSS-Framework?quickstart=1)

## Run it

**In the cloud** — click the badge above. The dev container installs dependencies
and starts the example automatically, then opens it on port 3000.

**Locally:**

```bash
npm install
npm run demo:web
# → http://localhost:3000
```

## What it shows

- a registered component vocabulary of ten fitness components
  ([`examples/fitness/manifest.example.json`](../fitness/manifest.example.json));
- three fictional athletes (performance / wellness / social) you can switch and
  tune with signal sliders;
- **deterministic generation** — the same `lint → infer segment → generate →
  validate` path the rest of the framework uses;
- the resulting **validated `UITree`**, rendered inside a phone mockup, with the
  validation result shown before anything renders;
- a **Screen ⇄ UITree toggle** — flip between the rendered interface and the exact
  JSON tree that produced it, so the relationship between contract and pixels is
  visible;
- a consent toggle: withdrawing personalisation falls back to a neutral screen;
- component-priority editing, bounded by audience and validation rules.

The same morning run produces a dense, chart-first screen for the performance
athlete; a gentle recovery-and-route screen for the wellness user; and a
kudos-and-leaderboard screen for the social user — from one vocabulary, never the
same way.

## Files worth editing

| File | What it controls |
| --- | --- |
| [`examples/fitness/manifest.example.json`](../fitness/manifest.example.json) | The component vocabulary and its contracts |
| [`examples/fitness/sample-activity.json`](../fitness/sample-activity.json) | The activity data the components bind to |
| [`examples/fitness/signal-model.json`](../fitness/signal-model.json) | How behaviour maps to an archetype |
| [`pipeline.ts`](./pipeline.ts) | The generation call the server runs |
| [`public/`](./public) | The renderer (plain HTML/JS, one card per component) |

## Design

The page follows the dynui.dev visual system (see
[`website/STYLEGUIDE.md`](../../website/STYLEGUIDE.md)): editorial monograph, ink on
paper, one dark room for the rendered screen, one teal spot for validation and
interaction. The two brand faces (Bricolage Grotesque, Fragment Mono) are vendored
into [`public/fonts`](./public/fonts) from `website/public/fonts`.

## How the pipeline stays bounded

- generated trees only reference **registered** components;
- output must pass `validateRenderableTree` before the UI renders it — an invalid
  tree is shown as a validation failure, never as a rendered screen;
- profiles carry only **fictional** signals; no real user data or consent is simulated;
- there is no hosted service, model, registry, or analytics — it is only a runnable
  example of the self-hosted framework.

## Maintaining this example

The example imports the real `@dynui/*` packages, so it exercises framework code
rather than a copy. To verify it after changing the framework or the fitness domain:

```bash
npm run typecheck                         # types across the repo, incl. this example
node --import tsx --test tests/web-example.test.ts   # the example's own smoke test
npm run demo:web                          # then click through in the browser
```

`tests/web-example.test.ts` imports the same `buildScreen` the server serves, so a
change that breaks the demo (a renamed component, a signal-model tweak that changes
the inferred segment) fails CI. Update that test alongside the fitness domain
artifacts. If you add a new component to the manifest, add a renderer for its
`componentId` in [`public/app.js`](./public/app.js) (unknown components fall back to
a raw JSON card).
