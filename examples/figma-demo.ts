/**
 * Source the manifest from Figma: walk a Figma file → ComponentManifest → generate
 * a real screen from it. Proves the design-tool → runtime pipeline end to end.
 *
 *   npm run demo:figma
 *
 * Offline, this runs against a Figma-file fixture. Against a live file:
 *   const manifest = await new FigmaRestClient(token).fetchManifest(fileKey);
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { JsonValue, SignalProfile, UINode } from "@dynui/contracts";
import { extractFromFigmaFile, figmaToManifest, type FigmaFile } from "@dynui/figma";
import { generateScreen, HeuristicModelProvider } from "@dynui/generate";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const readJson = (p: string) => JSON.parse(readFileSync(join(root, p), "utf8"));

const file = readJson("examples/figma/figma-file.fixture.json") as FigmaFile;
const data = readJson("examples/fitness/sample-activity.json") as Record<string, JsonValue>;
const profiles = readJson("examples/fitness/signal-profile.examples.json") as Record<string, SignalProfile>;

const exported = extractFromFigmaFile(file);
const manifest = figmaToManifest(exported);

console.log("\n=== Manifest sourced from Figma ===");
console.log(`registry: ${manifest.registry.name}@${manifest.registry.version} (${manifest.registry.domain})`);
for (const c of manifest.components) {
  const v = c.variants.map((x) => x.id).join("|") || "—";
  const gate = c.experiment ? ` [canary:${c.experiment.id}]` : "";
  console.log(`  ${c.id} [${c.category}] variants:{${v}} audience:${c.contract.audience.join("/")}${gate}`);
}

const ids = (node: UINode): string[] => {
  const out: string[] = [];
  (function walk(n: UINode) {
    if (n.componentId) out.push(n.componentId);
    (n.children ?? []).forEach(walk);
  })(node);
  return out;
};

const provider = new HeuristicModelProvider();
const res = await generateScreen(provider, {
  surface: "activity-detail",
  profile: profiles.performanceAthlete,
  manifest,
  constraints: manifest.constraints,
  experiments: [],
  data,
});

console.log("\n=== Generated from the Figma-sourced manifest (performance user) ===");
console.log(`  valid: ${res.validation.ok}  fallback: ${res.usedFallback}`);
console.log(`  screen: ${ids(res.tree.root).join(", ")}`);
console.log("\nDesigner edits in Figma → manifest → live personalized screen.\n");
