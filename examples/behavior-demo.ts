/**
 * The live loop: a brand-new user (no behavior, no archetype) gets a neutral
 * screen. We log a session of interactions, aggregate them back into signals,
 * re-infer the archetype, and regenerate — the screen morphs to fit how they
 * actually behaved.
 *
 *   npm run demo:behavior
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { ComponentManifest, JsonValue, SignalProfile, UINode } from "@dynui/contracts";
import { generateScreen, HeuristicModelProvider } from "@dynui/generate";
import {
  BatchingLogger,
  aggregateBehavior,
  applyBehavior,
  arraySink,
  type BehaviorEvent,
} from "@dynui/telemetry";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const readJson = (p: string) => JSON.parse(readFileSync(join(root, p), "utf8"));
const manifest = readJson("examples/fitness/manifest.example.json") as ComponentManifest;
const profiles = readJson("examples/fitness/signal-profile.examples.json") as Record<string, SignalProfile>;
const data = readJson("examples/fitness/sample-activity.json") as Record<string, JsonValue>;

const SURFACE = "activity-detail";
const provider = new HeuristicModelProvider();

const componentIds = (tree: { root: UINode }): string[] => {
  const out: string[] = [];
  (function walk(n: UINode) {
    if (n.componentId) out.push(n.componentId);
    (n.children ?? []).forEach(walk);
    Object.values(n.slots ?? {}).flat().forEach(walk);
  })(tree.root);
  return out;
};

// 1. Cold-start user: no behavior, no archetype.
const cold: SignalProfile = structuredClone(profiles.performanceAthlete);
cold.subject.anonId = "newuser";
cold.behavior = {};
cold.archetype = undefined;
cold.preferences = {};

const before = await generateScreen(provider, {
  surface: SURFACE,
  profile: cold,
  manifest,
  constraints: manifest.constraints,
  experiments: [],
  data,
});

// 2. Log a session: this user is shown a range of cards and keeps tapping the
//    data-heavy ones (charts, splits, zones) — classic performance behavior.
const events: BehaviorEvent[] = [];
const logger = new BatchingLogger(arraySink(events), 1000);
const log = (type: "exposure" | "tap", componentId: string) =>
  logger.log({ type, anonId: cold.subject.anonId, surface: SURFACE, componentId });

const session: Record<string, { shown: number; tapped: number }> = {
  "training-load-chart": { shown: 8, tapped: 7 },
  "hr-zone-breakdown": { shown: 8, tapped: 6 },
  "split-table": { shown: 8, tapped: 6 },
  "insight-card": { shown: 8, tapped: 1 },
  "social-kudos-bar": { shown: 8, tapped: 0 },
};
for (const [id, { shown, tapped }] of Object.entries(session)) {
  for (let i = 0; i < shown; i++) log("exposure", id);
  for (let i = 0; i < tapped; i++) log("tap", id);
}
await logger.flush();

// 3. Aggregate events → signals → updated profile.
const delta = aggregateBehavior(events, manifest);
const warm = applyBehavior(cold, delta);

const after = await generateScreen(provider, {
  surface: SURFACE,
  profile: warm,
  manifest,
  constraints: manifest.constraints,
  experiments: [],
  data,
});

console.log(`\n=== Behavior loop (${events.length} events this session) ===\n`);
console.log("Aggregated engagement signals:");
for (const [k, v] of Object.entries(delta)) console.log(`  ${k} = ${v.toFixed(2)}`);

console.log(
  `\nArchetype:  before = ${cold.archetype ?? "(none)"}  →  after = ${
    warm.archetype ? `${warm.archetype.primary} (conf ${warm.archetype.confidence})` : "(none)"
  }`,
);
console.log(`\nCold screen : ${componentIds(before.tree).join(", ")}`);
console.log(`Warm screen : ${componentIds(after.tree).join(", ")}`);
console.log("\nThe same user, same activity — the UI adapted to how they behaved.\n");
