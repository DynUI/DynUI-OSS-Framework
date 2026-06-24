# Contributing to DynUI

Thanks for your interest in contributing. DynUI is a self-hosted framework
for bounded, validated, per-user UI composition. This guide gets you from a fresh
clone to a green check without reading the source.

## Local Setup

Requirements: **Node 20+** (CI tests Node 20 and current stable) and npm.

```bash
git clone <repo-url>
cd "DynUI"
npm install        # installs the workspace; no API keys required
npm run typecheck  # should pass clean
npm test           # runs the full suite incl. the contract + generation evals
```

The core flow runs fully offline and deterministically — **no model API key is
required** for development, tests, or evals.

## Package Layout

This is an npm-workspaces monorepo. Packages live under `packages/*`:

| Package | Responsibility |
|---------|----------------|
| `@dynui/contracts` | Shared types + hand-rolled runtime schemas + JSON Schema export |
| `@dynui/signal` | Resolve and evaluate signal-path conditions / segment inference |
| `@dynui/validate` | Validate a `UITree` against the manifest + full render context |
| `@dynui/generate` | Heuristic engine, optional model providers, repair + fallback |
| `@dynui/experiments` | Component-level assignment, logging, promote/rollback analysis |
| `@dynui/telemetry` | Turn interaction events into behavior signals + inferred archetype |
| `@dynui/profile` | Profile Adapter implementations (in-memory, file-backed) |
| `@dynui/privacy` | Anonymization, sensitivity model, prompt minimization, redaction |
| `@dynui/figma` | Figma → manifest extraction, manifest lint + diff |

Other top-level directories:

- `apps/fitness-app` — the reference React Native / Expo renderer (NOT in the
  workspace; has its own `node_modules`). Illustrative, not published.
- `examples/` — domain fixtures (fitness, news) and runnable demos.
- `eval/` — the contract + generation eval harnesses (thresholds encoded in code).
- `scripts/` — developer scripts (schema gen, manifest lint, screen gen, visual).
- `tests/` — Node test-runner tests and the fixture corpus under `tests/fixtures/`.

## Commands

```bash
npm run typecheck         # tsc --noEmit across the workspace
npm test                  # full test suite (includes the evals)
npm run build             # tsc -b → dist (ESM + d.ts) per package
npm run gen:schema -- --check   # fail if JSON Schema artifacts are stale
npm run lint:manifest     # lint the reference manifest (exits non-zero on errors)
npm run eval:contracts    # validate the fixture corpus: every validator rule, pass + fail
npm run eval:generation   # prove generation yields a valid or explicit non-renderable result
npm run test:visual       # Playwright/Chromium renderer proof (needs a browser)
```

The CLI mirrors the most common checks for adopters:

```bash
npx dynui validate <manifest.json>   # parse + schema-validate a manifest
npx dynui lint <manifest.json>       # governance lint
npx dynui schema [<artifact>]        # print/list the shipped JSON Schemas
```

JSON-Schema **freshness** is a framework-repo task, not a CLI command:

```bash
npm run gen:schema -- --check        # fail if the committed JSON Schema artifacts are stale
```

### Running against a real model (optional)

```bash
echo "OPENROUTER_API_KEY=sk-or-..." > .env   # or ANTHROPIC_API_KEY
echo "DYNUI_MODEL=anthropic/claude-sonnet-4.5" >> .env
npm run gen:verify
```

Live model generation is optional. It is intended for background, session-boundary,
or cache-warming flows — never on the device's render path. To include live-provider
budgets in the generation eval, run `DYNUI_EVAL_LIVE=1 npm run eval:generation`
with a configured provider key.

## Coding Conventions

- **TypeScript, ESM, zero runtime dependencies in core packages.** Don't add a
  runtime dependency to a core package without discussion. Provider SDKs are
  optional peer dependencies of `@dynui/generate`, not hard deps.
- **Relative imports inside `packages/*/src` use `.js` extensions** (NodeNext-style
  ESM). Keep this when adding files or the build/`exports` will break.
- Match the surrounding style: small focused modules, explicit error codes, no
  clever abstractions. Public artifacts are gated by runtime schemas — keep
  `schema/artifacts.ts` and the emitted JSON Schema in sync (`npm run gen:schema`).
- Don't weaken the safety boundary: the validator, consent enforcement, and the
  experiment gate are load-bearing. New behavior must come with fixtures + tests.

## Adding a Component Manifest Fixture

1. Add the manifest JSON under `tests/fixtures/manifests/valid/` (or `invalid/`).
2. If it should be exercised by the contract eval, add an expectation in
   [`eval/contracts-cases.ts`](eval/contracts-cases.ts) (for invalid fixtures, pin
   the expected error code / message substring).
3. Run `npm run eval:contracts` and `npm test`.
4. Valid fitness trees are emitted by `eval/_bootstrap.ts` (valid by construction);
   regenerate if you change a validator rule that affects them.

## Adding a Validator Rule Safely

1. Add the new error code to the `ValidationCode` union in
   `packages/contracts/src/ui-tree.ts` (don't rename or remove existing codes —
   fixtures and tests pin them).
2. Implement the check in `packages/validate/src/validate.ts`. Decide whether it is
   **structural** (manifest-only) or **context-sensitive** (needs a profile / data /
   experiments) — context-sensitive rules belong behind `validateRenderableTree`.
3. Add a positive and a negative fixture + a mutation test in
   `tests/validate-strict.test.ts`.
4. If the rule touches a public artifact shape, update `schema/artifacts.ts` and run
   `npm run gen:schema`.
5. Run `npm test`, `npm run eval:contracts`, and `npm run typecheck`.

## Pull Requests

- Keep PRs focused; one logical change per PR.
- Ensure `npm run typecheck`, `npm test`, and `npm run build` pass.
- Add a `CHANGELOG.md` entry under **Unreleased** for user-facing changes.
- Don't include internal planning notes (e.g. `PLAN.md` is git-ignored — keep it
  that way).

By contributing you agree your contributions are licensed under the project's
[Apache-2.0](LICENSE) license.

## Developer Certificate of Origin

DynUI uses the Developer Certificate of Origin (DCO), not a Contributor License
Agreement. Add a sign-off to each commit:

```bash
git commit --signoff
```

The sign-off certifies that you wrote the contribution or otherwise have the right
to submit it under the project license.
