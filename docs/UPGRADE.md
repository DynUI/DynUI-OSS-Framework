# Versioning & Upgrade Policy

## Semver

All `@dynui/*` packages are versioned together and follow semver:

- **patch** — bug fixes, no contract change.
- **minor** — additive, backward-compatible (new optional fields, new exports).
- **major** — breaking changes to a public contract or a removed export.

Public API = what each package's `index.ts` exports. Anything not exported is
internal and may change without a major bump.

## Artifact schema versions

Public JSON artifacts carry their own `schemaVersion`, independent of package
version:

| Artifact | Current | Validator |
|---|---|---|
| `SignalProfile` | `signal-profile/1.0` | `parseSignalProfile` |
| `ComponentManifest` | `component-manifest/1.0` | `parseComponentManifest` / `migrateManifest` |
| `UITree` | `ui-tree/1.0` | `parseUITree` / `migrateUITree` |
| `SignalModel` | `signal-model/1.0` | `parseSignalModel` |
| `BehaviorEvent` | (unversioned, additive) | `parseBehaviorEvent` |
| `ExperimentDef` | (unversioned, additive) | `parseExperimentDef` |

JSON Schema for each is generated into `@dynui/contracts/schema/*.json`
(`npm run gen:schema`) and CI fails if they are stale.

## Schema migration policy

- A new artifact `schemaVersion` is introduced for any breaking shape change.
- `migrateManifest` / `migrateUITree` accept any **supported** version and upgrade
  it to the current shape before validating. Add per-version upgrade steps there.
- An **unsupported or future** version **fails closed** with an actionable error —
  never silently mis-parsed.

## Deprecation policy

- Components: mark `deprecated: true` and set `replacedBy`. `lintManifest` warns by
  default and errors under `{ deprecatedAsError: true }`. Keep a deprecated
  component for at least one minor cycle before removal.
- Exports/APIs: deprecate in a minor (documented), remove in the next major.

## Compatibility matrix

| | Requires |
|---|---|
| Node | >= 20 |
| Module format | ESM only (`"type": "module"`) |
| Renderer ↔ manifest | every component has a `RendererSpec`; `minRendererVersion` honored; `checkRendererCompat` must pass |
| Manifest ↔ manifest | `diffManifest` must show no unaccepted breaking change |

## Releasing

Before publishing: `npm install && npm run build && npm test && npm run typecheck &&
npm run eval:contracts && npm run eval:generation && npm run gen:schema -- --check`.
Internal deps are pinned (`^0.1.0`, no wildcards); each package ships only `dist`
(+ `schema` for contracts) and exports its public entrypoint only.
