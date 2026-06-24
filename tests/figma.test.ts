import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { UINode } from "@dynui/contracts";
import { extractFromFigmaFile, figmaToManifest, parseAnnotation, type FigmaFile } from "@dynui/figma";
import { validateTree } from "@dynui/validate";
import { composeHeuristic } from "@dynui/generate";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const file = JSON.parse(
  readFileSync(join(root, "examples/figma/figma-file.fixture.json"), "utf8"),
) as FigmaFile;
const data = JSON.parse(readFileSync(join(root, "examples/fitness/sample-activity.json"), "utf8"));
const profiles = JSON.parse(
  readFileSync(join(root, "examples/fitness/signal-profile.examples.json"), "utf8"),
);

const manifest = figmaToManifest(extractFromFigmaFile(file));

test("parseAnnotation reads the dynui block, ignores prose", () => {
  const a = parseAnnotation("hello\n\n```dynui\n{ \"category\": \"chart\", \"priority\": 9 }\n```");
  assert.equal(a.category, "chart");
  assert.equal(a.priority, 9);
  assert.deepEqual(parseAnnotation("no block here"), {});
});

test("figmaToManifest maps components, variants, and the canary gate", () => {
  const ids = manifest.components.map((c) => c.id).sort();
  assert.deepEqual(ids, ["activity-headline", "insight-card", "strength-volume-card", "training-load-chart"]);

  const chart = manifest.components.find((c) => c.id === "training-load-chart")!;
  assert.deepEqual(chart.variants.map((v) => v.id).sort(), ["full", "sparkline"]);
  assert.equal(chart.engagementSignal, "fitness.engagement.charts.openRate");

  const strength = manifest.components.find((c) => c.id === "strength-volume-card")!;
  assert.equal(strength.experiment?.id, "exp.strength-volume");

  assert.deepEqual(manifest.constraints.neverHide, ["activity-headline"]);
});

test("a screen generated from the Figma-sourced manifest is valid", () => {
  const ids = (node: UINode): string[] => {
    const out: string[] = [];
    (function walk(n: UINode) {
      if (n.componentId) out.push(n.componentId);
      (n.children ?? []).forEach(walk);
    })(node);
    return out;
  };
  const tree = composeHeuristic({
    surface: "activity-detail",
    profile: profiles.performanceAthlete,
    manifest,
    constraints: manifest.constraints,
    experiments: [],
    data,
  });
  assert.ok(validateTree(tree, manifest).ok);
  assert.ok(ids(tree.root).includes("activity-headline"));
  assert.ok(!ids(tree.root).includes("strength-volume-card"), "canary stays gated");
});
