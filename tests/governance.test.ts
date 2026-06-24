import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { ComponentManifest } from "@dynui/contracts";
import { lintManifest, lintPassed, diffManifest, validateFigmaFile, figmaValidationPassed } from "@dynui/figma";
import {
  checkRendererCompat,
  rendererSpecs,
  type ManifestLike,
} from "../apps/fitness-app/src/renderer/registry-contract";

const root = join(import.meta.dirname, "..");
const rj = (p: string) => JSON.parse(readFileSync(join(root, p), "utf8"));
const clone = <T>(x: T): T => structuredClone(x);
const fitness = rj("examples/fitness/manifest.example.json") as ComponentManifest;

// --- lint ------------------------------------------------------------------

test("the example manifest passes lint (no errors)", () => {
  const issues = lintManifest(fitness);
  assert.ok(lintPassed(issues), `unexpected lint errors: ${issues.filter((i) => i.severity === "error").map((i) => i.code).join(", ")}`);
});

test("lint flags weak contracts and missing descriptions as errors", () => {
  const m = clone(fitness);
  m.components[1].description = "x"; // too short
  m.components[2].contract.audience = []; // weak contract
  const issues = lintManifest(m);
  assert.ok(!lintPassed(issues));
  const codes = issues.filter((i) => i.severity === "error").map((i) => i.code);
  assert.ok(codes.includes("missing-description"));
  assert.ok(codes.includes("weak-contract"));
});

test("lint requires goals on experiment-gated components", () => {
  const m = clone(fitness);
  const exp = m.components.find((c) => c.experiment)!;
  exp.contract.goals = [];
  assert.ok(lintManifest(m).some((i) => i.code === "missing-goals" && i.severity === "error"));
});

test("a deprecated component warns by default, errors under strict policy", () => {
  const m = clone(fitness);
  m.components[3].deprecated = true;
  m.components[3].replacedBy = "recovery-score-card";
  assert.ok(lintManifest(m).some((i) => i.code === "deprecated" && i.severity === "warning"));
  assert.ok(!lintPassed(lintManifest(m, { deprecatedAsError: true })));
});

// --- diff ------------------------------------------------------------------

test("manifest diff flags a new required data key as breaking", () => {
  const prev = clone(fitness);
  const next = clone(fitness);
  next.components[1].data.push({ key: "readiness.newRequired", type: "number", required: true });
  const d = diffManifest(prev, next);
  assert.ok(d.breaking);
  const change = d.changed.find((c) => c.id === next.components[1].id)!;
  assert.ok(change.addedRequiredData.includes("readiness.newRequired"));
  assert.ok(change.breaking);
});

test("manifest diff reports added / removed components", () => {
  const prev = clone(fitness);
  const next = clone(fitness);
  next.components = next.components.filter((c) => c.id !== "segment-leaderboard");
  const d = diffManifest(prev, next);
  assert.ok(d.removed.includes("segment-leaderboard"));
  assert.ok(d.breaking, "removing a component is breaking");
});

// --- figma annotation validation -------------------------------------------

test("bad Figma annotations are reported with the exact node and parse error", () => {
  const file = rj("tests/fixtures/figma/bad-annotations.fixture.json");
  const issues = validateFigmaFile(file);
  assert.ok(!figmaValidationPassed(issues));
  const bad = issues.find((i) => i.code === "bad-annotation");
  assert.ok(bad);
  assert.equal(bad!.nodeId, "9:1");
  assert.match(bad!.message, /Unparseable/);
});

test("duplicate generated component ids fail Figma validation", () => {
  const file = rj("tests/fixtures/figma/bad-annotations.fixture.json");
  const issues = validateFigmaFile(file);
  assert.ok(issues.some((i) => i.code === "duplicate-id" && i.nodeId === "9:3"));
});

// --- design tokens ---------------------------------------------------------

test("renderer compat fails when the manifest requires an unsupported token", () => {
  const manifest: ManifestLike = { ...(fitness as unknown as ManifestLike), requiredTokens: ["color.accent", "motion.parallax3d"] };
  const issues = checkRendererCompat(manifest, rendererSpecs);
  assert.ok(issues.some((i) => i.code === "unsupported-token"));
  // supported tokens pass.
  const ok = checkRendererCompat({ ...(fitness as unknown as ManifestLike), requiredTokens: ["color.accent"] }, rendererSpecs);
  assert.ok(!ok.some((i) => i.code === "unsupported-token"));
});
