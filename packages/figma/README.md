# @dynui/figma

Source a `ComponentManifest` from Figma, and govern manifests (lint / diff /
validate). The design tool stays swappable — only the manifest is the hard
dependency downstream.

## Figma → manifest
- `FigmaRestClient.fetchManifest(fileKey)` — live: REST → extract → manifest.
- `extractFromFigmaFile(fileJson)` → intermediate; `figmaToManifest(export)` →
  `ComponentManifest`.
- `parseAnnotation(description)` — the ` ```dynui ` JSON convention; `toKebab`.
- `validateFigmaFile(fileJson)` — node-specific issues (bad annotation, duplicate
  generated id, missing field) **before** mapping.

## Governance
- `lintManifest(manifest, { deprecatedAsError? })` → `LintIssue[]` (missing
  description, weak contract, missing goals on experiment-gated components,
  ambiguous variants, unused category, wildcard audience, deprecation);
  `lintPassed(issues)`.
- `diffManifest(prev, next)` → added/removed/changed components, with a `breaking`
  flag (new required data, removed component/variant, changed experiment gate).
