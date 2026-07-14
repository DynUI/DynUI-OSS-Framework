# @dynui/cli

A small, **file-based** developer CLI. It wraps the same public functions you'd call
in code, so a project can validate and lint manifests — and read the shipped JSON
Schemas — without writing TypeScript. It is deliberately **not** a management console:
no network, no state, no config.

```bash
npx @dynui/cli validate manifest.json            # parse + schema-validate a manifest
npx @dynui/cli validate-tree tree.json m.json    # STRUCTURAL UITree validation
npx @dynui/cli lint manifest.json                # governance lint (non-zero on errors)
npx @dynui/cli schema component-manifest         # print a shipped JSON Schema
npx @dynui/cli schema                            # list available schemas
npx @dynui/cli --help
```

Once installed as a dependency, the binary is named `dynui` (e.g. `dynui validate manifest.json`).
In this repo you can also run it via `npm run dynui -- <args>`.

## Commands

| Command | What it does |
|---------|--------------|
| `validate <manifest.json>` | Parses the manifest with the runtime schema (`parseComponentManifest`) and reports `[code] path: message` issues. Exit 1 on failure. |
| `validate-tree <tree.json> <manifest.json>` | Parses a `UITree` and runs **structural** validation (`validateTreeStructure`). This is **not** the render gate — full validation needs request context (consent, data, surface, experiments); use `validateRenderableTree(...)` in code. |
| `lint <manifest.json>` | Governance lint (`lintManifest`): missing descriptions/contracts/goals, ambiguous variants, wildcard audiences, deprecations. Exit 1 on errors (warnings don't fail). |
| `schema [<artifact>]` | Prints a JSON Schema shipped with `@dynui/contracts` (`component-manifest`, `signal-profile`, `ui-tree`, `generation-request`, `behavior-event`, `experiment-def`, `signal-model`). No arg lists them. |

## What this CLI is not

Running contract/generation evals and checking JSON-Schema freshness are
framework-repo tasks (`npm run eval:contracts`, `npm run eval:generation`,
`npm run gen:schema -- --check`) — see [CONTRIBUTING.md](../../CONTRIBUTING.md). They
operate on the framework's own source, not on an adopter's project, so they're npm
scripts rather than CLI commands.
