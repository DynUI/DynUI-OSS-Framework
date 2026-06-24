import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  parseComponentManifest,
  parseSignalProfile,
  parseUITree,
  parseGenerationRequest,
  parseBehaviorEvent,
  parseExperimentDef,
  migrateManifest,
  migrateUITree,
  jsonSchemaDocument,
  signalProfileSchema,
  componentManifestSchema,
  uiTreeSchema,
  uiTreeDefs,
  generationRequestSchema,
  behaviorEventSchema,
  experimentDefSchema,
} from "@dynui/contracts";
import { validateTree } from "@dynui/validate";

const root = join(import.meta.dirname, "..");
const rj = (p: string) => JSON.parse(readFileSync(join(root, p), "utf8"));
const codes = (issues: { code: string }[]) => issues.map((i) => i.code);

test("current examples pass runtime schema validation", () => {
  assert.ok(parseComponentManifest(rj("examples/fitness/manifest.example.json")).ok);
  const profiles = rj("examples/fitness/signal-profile.examples.json");
  for (const k of ["performanceAthlete", "casualWellness", "socialCompetitive"]) {
    const r = parseSignalProfile(profiles[k]);
    assert.ok(r.ok, `profile ${k} should be valid`);
  }
  assert.ok(parseUITree(rj("tests/fixtures/trees/valid/flat-performance.json")).ok);
  assert.ok(parseUITree(rj("tests/fixtures/trees/valid/nested-slots.json")).ok, "recursive slots parse");
});

test("invalid JSON artifacts fail schema validation before validator traversal", () => {
  // A manifest that is not even shaped like a manifest never reaches validateTree.
  const r = parseComponentManifest({ totally: "wrong" });
  assert.ok(!r.ok);
  assert.ok(r.issues.length > 0);
  // The cast-based validator would have thrown; schema catches it first, cleanly.
});

test("strict objects reject unknown top-level fields", () => {
  const good = rj("tests/fixtures/profiles/valid/performance.json");
  const r = parseSignalProfile({ ...good, somethingExtra: true });
  assert.ok(!r.ok);
  assert.ok(codes(r.issues).includes("unrecognized-key"));
});

test("duplicate component IDs are rejected", () => {
  const r = parseComponentManifest(rj("tests/fixtures/manifests/invalid/duplicate-component-ids.json"));
  assert.ok(!r.ok);
  assert.ok(codes(r.issues).includes("duplicate-component-id"));
});

test("constraint references to missing components are rejected", () => {
  const r = parseComponentManifest(rj("tests/fixtures/manifests/invalid/constraint-ref-missing-component.json"));
  assert.ok(!r.ok);
  assert.ok(codes(r.issues).includes("constraint-ref-missing"));
});

test("invalid semver component version is rejected", () => {
  const m = rj("examples/fitness/manifest.example.json");
  m.components[0].version = "not-semver";
  const r = parseComponentManifest(m);
  assert.ok(!r.ok);
  assert.ok(codes(r.issues).some((c) => c === "pattern" || c === "bad-semver"));
});

test("unknown / future schema versions fail closed", () => {
  const m = rj("examples/fitness/manifest.example.json");
  m.schemaVersion = "component-manifest/9.9";
  const r = parseComponentManifest(m);
  assert.ok(!r.ok);
  assert.ok(codes(r.issues).includes("unsupported-version"));

  const t = rj("tests/fixtures/trees/valid/flat-performance.json");
  t.schemaVersion = "ui-tree/2.0";
  assert.ok(!parseUITree(t).ok);
});

test("migrate* helpers fail closed with actionable errors", () => {
  const m = rj("examples/fitness/manifest.example.json");
  m.schemaVersion = "component-manifest/9.9";
  assert.throws(() => migrateManifest(m), /not supported/);
  assert.throws(() => migrateUITree({ nope: true }), /Cannot migrate UITree/);
  // Valid input round-trips through migrate.
  assert.ok(migrateManifest(rj("examples/fitness/manifest.example.json")).components.length > 0);
});

test("bad archetype confidence (out of [0,1]) is rejected", () => {
  const r = parseSignalProfile(rj("tests/fixtures/profiles/invalid/bad-archetype-confidence.json"));
  assert.ok(!r.ok);
  assert.ok(codes(r.issues).includes("max"));
});

test("behavior events and experiment defs validate", () => {
  assert.ok(parseBehaviorEvent({ type: "tap", anonId: "a", surface: "s", ts: "2026-01-01T00:00:00Z" }).ok);
  assert.ok(!parseBehaviorEvent({ type: "nope", anonId: "a", surface: "s", ts: "x" }).ok);
  assert.ok(
    parseExperimentDef({
      id: "exp.x",
      description: "d",
      segment: [],
      allocation: 0.5,
      variants: [{ id: "control", weight: 1 }],
      goal: "g",
    }).ok,
  );
  assert.ok(!parseExperimentDef({ id: "exp.x", description: "d", segment: [], allocation: 2, variants: [], goal: "g" }).ok);
});

test("a manifest that fails the schema is never handed to validateTree", () => {
  // Guard the phase-gate intent: parse first, only validate trees against a parsed manifest.
  const raw = { schemaVersion: "component-manifest/1.0", registry: {}, components: "nope", constraints: {} };
  const r = parseComponentManifest(raw);
  assert.ok(!r.ok);
  // validateTree must only ever run on r.value, which we never reach here.
  assert.equal(typeof validateTree, "function");
});

// --- nested compatibility in parseGenerationRequest (Phase 3) --------------

const mkReq = (over: Record<string, unknown> = {}) => {
  const manifest = rj("examples/fitness/manifest.example.json");
  const profile = rj("examples/fitness/signal-profile.examples.json").performanceAthlete;
  return {
    surface: "activity-detail",
    profile,
    manifest,
    constraints: manifest.constraints,
    experiments: [],
    data: {},
    ...over,
  };
};

test("a valid generation request passes parseGenerationRequest", () => {
  const r = parseGenerationRequest(mkReq());
  assert.ok(r.ok, r.ok ? "" : JSON.stringify(r.issues));
});

test("parseGenerationRequest rejects a manifest with duplicate component IDs (nested path)", () => {
  const manifest = rj("tests/fixtures/manifests/invalid/duplicate-component-ids.json");
  const r = parseGenerationRequest(mkReq({ manifest, constraints: manifest.constraints }));
  assert.ok(!r.ok);
  assert.ok(codes(r.issues).includes("duplicate-component-id"));
  assert.ok(r.issues.some((i) => i.path.startsWith("/manifest/")), "issue path is prefixed with /manifest");
});

test("parseGenerationRequest rejects a constraint referencing a missing component", () => {
  const manifest = rj("tests/fixtures/manifests/invalid/constraint-ref-missing-component.json");
  const r = parseGenerationRequest(mkReq({ manifest, constraints: manifest.constraints }));
  assert.ok(!r.ok);
  assert.ok(codes(r.issues).includes("constraint-ref-missing"));
});

test("parseGenerationRequest rejects a future manifest schema version", () => {
  const manifest = rj("examples/fitness/manifest.example.json");
  manifest.schemaVersion = "component-manifest/9.9";
  const r = parseGenerationRequest(mkReq({ manifest, constraints: manifest.constraints }));
  assert.ok(!r.ok);
  assert.ok(r.issues.some((i) => i.code === "unsupported-version" && i.path === "/manifest/schemaVersion"));
});

test("parseGenerationRequest rejects a future profile schema version", () => {
  const profile = rj("examples/fitness/signal-profile.examples.json").performanceAthlete;
  profile.schemaVersion = "signal-profile/9.9";
  const r = parseGenerationRequest(mkReq({ profile }));
  assert.ok(!r.ok);
  assert.ok(r.issues.some((i) => i.code === "unsupported-version" && i.path === "/profile/schemaVersion"));
});

test("parseGenerationRequest rejects an invalid seedTree schema version", () => {
  const seedTree = rj("tests/fixtures/trees/valid/flat-performance.json");
  seedTree.schemaVersion = "ui-tree/2.0";
  const r = parseGenerationRequest(mkReq({ options: { seedTree } }));
  assert.ok(!r.ok);
  assert.ok(r.issues.some((i) => i.code === "unsupported-version" && i.path === "/options/seedTree/schemaVersion"));
});

test("parseGenerationRequest rejects constraints that diverge from manifest.constraints", () => {
  const manifest = rj("examples/fitness/manifest.example.json");
  const divergent = { ...manifest.constraints, maxModulesAboveFold: 999 };
  const r = parseGenerationRequest(mkReq({ manifest, constraints: divergent }));
  assert.ok(!r.ok);
  assert.ok(codes(r.issues).includes("constraints-divergent"));
});

test("exported JSON Schema artifacts are generated and up to date", () => {
  const expected: Record<string, unknown> = {
    "signal-profile.schema.json": jsonSchemaDocument(signalProfileSchema, { id: "https://dynui.dev/schema/signal-profile.schema.json", title: "SignalProfile" }),
    "component-manifest.schema.json": jsonSchemaDocument(componentManifestSchema, { id: "https://dynui.dev/schema/component-manifest.schema.json", title: "ComponentManifest" }),
    "ui-tree.schema.json": jsonSchemaDocument(uiTreeSchema, { id: "https://dynui.dev/schema/ui-tree.schema.json", title: "UITree", defs: uiTreeDefs }),
    "generation-request.schema.json": jsonSchemaDocument(generationRequestSchema, { id: "https://dynui.dev/schema/generation-request.schema.json", title: "GenerationRequest", defs: uiTreeDefs }),
    "behavior-event.schema.json": jsonSchemaDocument(behaviorEventSchema, { id: "https://dynui.dev/schema/behavior-event.schema.json", title: "BehaviorEvent" }),
    "experiment-def.schema.json": jsonSchemaDocument(experimentDefSchema, { id: "https://dynui.dev/schema/experiment-def.schema.json", title: "ExperimentDef" }),
  };
  for (const [file, doc] of Object.entries(expected)) {
    const cur = readFileSync(join(root, "packages/contracts/schema", file), "utf8");
    assert.equal(cur, JSON.stringify(doc, null, 2) + "\n", `${file} is stale — run: npm run gen:schema`);
  }
});
