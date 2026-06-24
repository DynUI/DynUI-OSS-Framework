# Figma Export Workflow

DynUI can source a `ComponentManifest` from a Figma file while keeping the manifest
as the only runtime dependency. Figma is an authoring source, not a required render
dependency.

## Authoring Convention

Designers add a fenced `dynui` JSON block to each component description:

````markdown
```dynui
{
  "id": "recovery-score-card",
  "category": "insight",
  "description": "Shows the user's recovery readiness.",
  "surfaces": ["activity-detail"],
  "audience": ["wellness"],
  "priority": 80
}
```
````

File-level configuration lives in a text node named `@dynui/config`.

## Export Steps

1. Fetch or export the Figma file JSON.
2. Run `validateFigmaFile(fileJson)` to catch authoring errors early.
3. Run `extractFromFigmaFile(fileJson)`.
4. Convert with `figmaToManifest(exported)`.
5. Run `migrateManifest` and `lintManifest`.
6. Diff against the previous accepted manifest with `diffManifest`.
7. Run renderer compatibility checks before shipping.

## Code

```ts
import { migrateManifest } from "@dynui/contracts";
import { validateFigmaFile, extractFromFigmaFile, figmaToManifest, lintManifest, lintPassed } from "@dynui/figma";

const issues = validateFigmaFile(fileJson);
if (issues.length) throw new Error(JSON.stringify(issues, null, 2));

const manifest = migrateManifest(figmaToManifest(extractFromFigmaFile(fileJson)));
if (!lintPassed(lintManifest(manifest))) throw new Error("Manifest lint failed");
```

See [packages/figma/README.md](../packages/figma/README.md) and
[`examples/figma-demo.ts`](../examples/figma-demo.ts).
