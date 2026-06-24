/**
 * Emit JSON Schema (draft-07) artifacts for the public contracts into
 * packages/contracts/schema/. These are checked in and shipped with the package
 * so non-TS / cross-language consumers can validate artifacts too.
 *
 *   npm run gen:schema
 *
 * CI verifies these are up to date (npm run gen:schema -- --check).
 */
import { writeFileSync, readFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import {
  jsonSchemaDocument,
  signalProfileSchema,
  componentManifestSchema,
  uiTreeSchema,
  uiTreeDefs,
  generationRequestSchema,
  behaviorEventSchema,
  experimentDefSchema,
  signalModelSchema,
} from "@dynui/contracts";

const outDir = join(import.meta.dirname, "..", "packages/contracts/schema");
const BASE = "https://dynui.dev/schema";

const docs: Record<string, unknown> = {
  "signal-profile.schema.json": jsonSchemaDocument(signalProfileSchema, {
    id: `${BASE}/signal-profile.schema.json`,
    title: "SignalProfile",
  }),
  "component-manifest.schema.json": jsonSchemaDocument(componentManifestSchema, {
    id: `${BASE}/component-manifest.schema.json`,
    title: "ComponentManifest",
  }),
  "ui-tree.schema.json": jsonSchemaDocument(uiTreeSchema, {
    id: `${BASE}/ui-tree.schema.json`,
    title: "UITree",
    defs: uiTreeDefs,
  }),
  "generation-request.schema.json": jsonSchemaDocument(generationRequestSchema, {
    id: `${BASE}/generation-request.schema.json`,
    title: "GenerationRequest",
    defs: uiTreeDefs,
  }),
  "behavior-event.schema.json": jsonSchemaDocument(behaviorEventSchema, {
    id: `${BASE}/behavior-event.schema.json`,
    title: "BehaviorEvent",
  }),
  "experiment-def.schema.json": jsonSchemaDocument(experimentDefSchema, {
    id: `${BASE}/experiment-def.schema.json`,
    title: "ExperimentDef",
  }),
  "signal-model.schema.json": jsonSchemaDocument(signalModelSchema, {
    id: `${BASE}/signal-model.schema.json`,
    title: "SignalModel",
  }),
};

const check = process.argv.includes("--check");
if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

let stale = 0;
for (const [file, doc] of Object.entries(docs)) {
  const path = join(outDir, file);
  const next = JSON.stringify(doc, null, 2) + "\n";
  if (check) {
    const cur = existsSync(path) ? readFileSync(path, "utf8") : "";
    if (cur !== next) {
      console.error(`stale: ${file}`);
      stale++;
    }
  } else {
    writeFileSync(path, next);
    console.log(`wrote packages/contracts/schema/${file}`);
  }
}

if (check && stale) {
  console.error(`\n${stale} JSON Schema file(s) out of date. Run: npm run gen:schema`);
  process.exit(1);
}
if (check) console.log("✓ JSON Schema artifacts are up to date");
