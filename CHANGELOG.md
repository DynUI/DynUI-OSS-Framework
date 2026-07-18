# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).
While the project is pre-1.0 (`0.x`), minor versions may include breaking changes;
see [docs/UPGRADE.md](docs/UPGRADE.md) for the compatibility policy.

## [Unreleased]

### Added

- Heuristic-ceiling example (`examples/ceiling/`, `npm run demo:ceiling`) and a
  README section ("Where a model earns its place, above the heuristic") showing what an
  optional model adds over the deterministic engine: the heuristic ranks and lays out
  components in flat sections but never fills a slot, so it cannot nest or group; with an
  LLM composing, the same vocabulary is arranged into a nested panel — validated against
  the identical safety boundary. Includes a side-by-side diagram
  (`docs/assets/heuristic-vs-composed.svg`).
- Public repository hygiene: `SECURITY.md`, `CONTRIBUTING.md`,
  `GOVERNANCE.md`, `CODE_OF_CONDUCT.md`, `TRADEMARKS.md`, `CHANGELOG.md`,
  `CODEOWNERS`, GitHub issue/PR templates, branch-protection guidance, and a
  "Project Scope" section in `README.md`.
- Public launch docs and assets: deployment checklist, deterministic-only guide,
  model-provider guide, Figma export workflow, experiment adapter guide, renderer
  implementation guide, comparisons, draft launch copy, good-first-issue seeds,
  a draft logo/favicon, and a fitness demo screenshot.
- `@dynui/validate`: explicit validation entry points `validateTreeStructure`
  (manifest-only, structural) and `validateRenderableTree` (full render gate,
  enforces consent / surface / subject / data / experiments / fallback honesty).
  `validateRenderableTree` takes a **required** `RenderableValidateContext` and throws
  if `surface`, `profile`, `data`, or `experiments` is missing — so the render gate
  can never silently validate against a weaker boundary.
- Package manifests now declare `repository` (with `directory`), `homepage`, and
  `bugs`, as required for npm provenance / trusted publishing.
- `dynui` CLI (`packages/cli`) for `validate`, `validate-tree`, `lint`, and `schema`
  (print/list the shipped JSON Schemas).
- External integration adapter example(s) under `examples/integrations/`,
  demonstrating assignment / telemetry / profile extension points with mocked
  external calls. Examples only — not required dependencies.
- Package publish smoke test (`scripts/consumer-smoke.mjs`) and a CI job that packs
  the packages and runs a minimal adoption flow in a clean consumer project.
- CI Node version matrix (Node 22 + current stable) and a release/publish workflow
  with npm provenance plus a dependency-review check.
- README "When Not To Use This" guidance and a minimal non-fitness adoption
  walkthrough.

### Changed

- **Raised the minimum supported Node.js from 20 to 22** (`engines.node >= 22`).
  Node 20 reached end-of-life in April 2026, and the test runner's glob-based file
  selection (`node --test "tests/**/*.test.ts"`) requires Node ≥ 21. CI now tests
  Node 22 and current stable (24).
- **Production-safe consent defaults.** `BaseProfileAdapter` now defaults to
  deny-by-default consent (`personalization: false`, `analytics: false`,
  `modelTraining: false`). The permissive `DEV_DEFAULT_CONSENT` is now opt-in:
  demos import and pass it explicitly. Production code that forgets to configure
  consent gets a neutral, non-personalized profile.
- **Provider boundary.** Provider SDKs (`@anthropic-ai/sdk`) are now optional peer
  dependencies of `@dynui/generate` and loaded lazily, so the deterministic engine
  and fallback install and run with no provider SDK present.
- `insecureAnonymizer` now warns loudly when used outside `test`/`development`.
- Docs and quickstart examples use `createHmacAnonymizer` for any
  production-facing flow.
- `npm run eval:generation` now keeps live-provider budget checks opt-in via
  `DYNUI_EVAL_LIVE=1`, so the default public-readiness check remains deterministic
  even when a maintainer has model keys in `.env`.

## [0.1.0] - 2026-06-20

### Added

- Initial alpha: contracts + runtime schemas, deterministic generation engine and
  fallback, strict context-aware validation, consent/privacy enforcement, telemetry
  + behavior inference, component-level experiments, profile adapters, and a Figma
  manifest connector with lint/diff/governance.
- Reference React Native / Expo renderer (`apps/fitness-app`) with a renderer
  registry contract and per-component error boundaries.
- Eval harnesses (contracts + generation), a visual renderer proof, and a fixture
  corpus covering every validator rule.
