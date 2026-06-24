/**
 * Visual-test scenarios. Each scenario takes a VALIDATED fixture tree, resolves it
 * with the REAL renderer resolver (`resolveScreen`, the same RN-free code the app
 * uses), and ships the resolved sections + the manifest's known component ids to
 * the browser harness. The harness paints them and surfaces a safe fallback for any
 * unregistered component — exactly what the app's ErrorBoundary does.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { JsonValue, UITree } from "../../apps/fitness-app/src/contract-types";
import { resolveScreen, type RenderSection } from "../../apps/fitness-app/src/renderer/resolve";

const ROOT = join(import.meta.dirname, "..", "..");
const rj = (p: string) => JSON.parse(readFileSync(join(ROOT, p), "utf8"));

const fitnessManifest = rj("examples/fitness/manifest.example.json");
const slotsManifest = rj("tests/fixtures/manifests/valid/slots.json");
const fitnessData = rj("examples/fitness/sample-activity.json") as Record<string, JsonValue>;
const slotsData: Record<string, JsonValue> = {
  title: "Weekly Dashboard",
  value: 72,
  series: [3, 5, 4, 6, 8, 7],
};

const idsOf = (m: { components: { id: string }[] }): string[] => m.components.map((c) => c.id);

export interface VisualScenario {
  id: string;
  label: string;
  sections: RenderSection[];
  knownIds: string[];
  /** Substrings that MUST appear in the rendered page. */
  expectText: string[];
  /** When true this is the negative case: a safe fallback must be surfaced. */
  expectUnregistered?: string;
}

function scenario(
  id: string,
  label: string,
  treePath: string,
  data: Record<string, JsonValue>,
  manifest: { components: { id: string }[] },
  extra: Partial<VisualScenario> = {},
): VisualScenario {
  const tree = rj(treePath) as UITree;
  return {
    id,
    label,
    sections: resolveScreen(tree, data),
    knownIds: idsOf(manifest),
    expectText: [],
    ...extra,
  };
}

export function buildScenarios(): VisualScenario[] {
  // Missing OPTIONAL data: drop a non-required key; the component still renders
  // (its binding resolves to null) — it must not blank the screen or error.
  const { ["activity.photoUrl"]: _drop, ...thinFitness } = fitnessData;

  return [
    scenario("flat-performance", "Flat performance screen", "tests/fixtures/trees/valid/flat-performance.json", fitnessData, fitnessManifest, {
      expectText: ["activity-headline", "recovery-score-card"],
    }),
    scenario("nested-slots", "Nested slot screen", "tests/fixtures/trees/valid/nested-slots.json", slotsData, slotsManifest, {
      expectText: ["dashboard-panel", "mini-metric", "mini-chart"],
    }),
    scenario("no-consent-neutral", "No-consent neutral screen", "tests/fixtures/trees/valid/no-consent-neutral.json", fitnessData, fitnessManifest, {
      expectText: ["activity-headline"],
    }),
    scenario("experiment-gated", "Experiment-gated treatment screen", "tests/fixtures/trees/valid/experiment-gated.json", fitnessData, fitnessManifest, {
      expectText: ["strength-volume-card"],
    }),
    scenario("missing-optional-data", "Missing optional data screen", "tests/fixtures/trees/valid/flat-performance.json", thinFitness as Record<string, JsonValue>, fitnessManifest, {
      expectText: ["activity-headline"],
    }),
    // NEGATIVE: an unknown component must render the safe fallback, not crash/blank.
    scenario("error-boundary", "Renderer error-boundary fixture", "tests/fixtures/trees/invalid/unknown-component.json", fitnessData, fitnessManifest, {
      expectText: ["Unregistered component"],
      expectUnregistered: "ghost-card",
    }),
  ];
}
