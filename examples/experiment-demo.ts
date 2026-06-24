/**
 * Closes the loop: canary a brand-new component (`strength-volume-card`) to a slice
 * of the performance segment, simulate engagement, and let the engine recommend
 * promote / rollback — without shipping the component to everyone.
 *
 *   npm run demo:experiment
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type {
  ComponentManifest,
  JsonValue,
  SignalProfile,
  UINode,
} from "@dynui/contracts";
import { generateScreen, HeuristicModelProvider } from "@dynui/generate";
import { ComponentExperimentEngine, type ExperimentDef } from "@dynui/experiments";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const readJson = (p: string) => JSON.parse(readFileSync(join(root, p), "utf8"));
const manifest = readJson("examples/fitness/manifest.example.json") as ComponentManifest;
const profiles = readJson("examples/fitness/signal-profile.examples.json") as Record<
  string,
  SignalProfile
>;
const data = readJson("examples/fitness/sample-activity.json") as Record<string, JsonValue>;

// Seeded RNG so the simulated outcomes are reproducible.
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const experiment: ExperimentDef = {
  id: "exp.strength-volume",
  description: "Canary the Strength Volume card to performance users.",
  segment: [{ signal: "archetype.primary", op: "eq", value: "performance" }],
  allocation: 1, // whole eligible segment enters; 50/50 split is the canary
  variants: [
    { id: "control", weight: 0.5 },
    { id: "treatment", weight: 0.5 },
  ],
  goal: "strength-engagement",
  guardrails: { minSamplesPerVariant: 100 },
};

const engine = new ComponentExperimentEngine([experiment]);

// Synthesize a cohort: performance users (eligible) + wellness users (off-segment).
const COHORT = 800;
const rng = mulberry32(42);
const TRUE_RATE = { control: 0.18, treatment: 0.27 }; // treatment genuinely better

let eligible = 0;
let offSegment = 0;
for (let i = 0; i < COHORT; i++) {
  const isPerf = i % 4 !== 0; // ~75% performance, ~25% wellness
  const base = isPerf ? profiles.performanceAthlete : profiles.casualWellness;
  const user: SignalProfile = structuredClone(base);
  user.subject.anonId = `${isPerf ? "perf" : "well"}_${i}`;

  const variant = engine.assign(experiment.id, user);
  if (!variant) {
    offSegment++;
    continue;
  }
  eligible++;
  engine.recordExposure(experiment.id, variant, user.subject.anonId);
  if (rng() < TRUE_RATE[variant as "control" | "treatment"]) {
    engine.recordGoal(experiment.id, variant, user.subject.anonId);
  }
}

const result = engine.analyze(experiment.id);

console.log("\n=== Experiment: exp.strength-volume ===");
console.log(`Cohort ${COHORT} · eligible ${eligible} · off-segment (filtered out) ${offSegment}\n`);
const row = (s: typeof result.control) =>
  `  ${s.variant.padEnd(10)} exposures ${String(s.exposures).padStart(4)}  conversions ${String(
    s.conversions,
  ).padStart(4)}  rate ${(s.rate * 100).toFixed(1)}%`;
console.log(row(result.control));
console.log(row(result.treatment));
console.log(
  `\n  lift ${(result.liftPct * 100).toFixed(1)}%  ·  p=${result.pValue.toFixed(4)}  ·  significant: ${result.significant}`,
);
console.log(`\n  DECISION → ${result.recommendation.toUpperCase()}`);
console.log(`  ${result.rationale}`);

// Show the generation difference the assignment produces.
const has = (root: UINode, id: string): boolean => {
  if (root.componentId === id) return true;
  return (root.children ?? []).some((c) => has(c, id)) ||
    Object.values(root.slots ?? {}).flat().some((c) => has(c, id));
};
const provider = new HeuristicModelProvider();
const baseReq = {
  surface: "activity-detail",
  profile: profiles.performanceAthlete,
  manifest,
  constraints: manifest.constraints,
  data,
};
const control = await generateScreen(provider, { ...baseReq, experiments: [] });
const treatment = await generateScreen(provider, {
  ...baseReq,
  experiments: [{ experimentId: experiment.id, variant: "treatment" }],
});

console.log("\n=== Generated screen contains 'strength-volume-card'? ===");
console.log(`  control   : ${has(control.tree.root, "strength-volume-card")}`);
console.log(`  treatment : ${has(treatment.tree.root, "strength-volume-card")}`);

// Closed loop: engagement flows back into the signal layer.
if (result.recommendation === "promote") {
  const before = (profiles.performanceAthlete.behavior["fitness.engagement.strength.openRate"] ?? 0) as number;
  const after = result.treatment.rate;
  console.log("\n=== Closed loop: outcome → signal ===");
  console.log(
    `  behavior.fitness.engagement.strength.openRate: ${before} → ${after.toFixed(2)} (feeds future generation)`,
  );
}
console.log();
