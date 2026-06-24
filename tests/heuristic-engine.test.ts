import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type {
  ComponentManifest,
  ExperimentAssignment,
  GenerationRequest,
  JsonValue,
  SignalProfile,
  UINode,
  UITree,
} from "@dynui/contracts";
import { composeHeuristic, buildCacheKey } from "@dynui/generate";
import { validateTree, type ValidateContext } from "@dynui/validate";

const root = join(import.meta.dirname, "..");
const rj = (p: string) => JSON.parse(readFileSync(join(root, p), "utf8"));
const clone = <T>(x: T): T => structuredClone(x);

const fitness = rj("examples/fitness/manifest.example.json") as ComponentManifest;
const data = rj("examples/fitness/sample-activity.json") as Record<string, JsonValue>;
const perf = rj("tests/fixtures/profiles/valid/performance.json") as SignalProfile;
const noConsent = rj("tests/fixtures/profiles/valid/no-consent.json") as SignalProfile;

const req = (profile: SignalProfile, experiments: ExperimentAssignment[] = []): GenerationRequest => ({
  surface: "activity-detail",
  profile,
  manifest: fitness,
  constraints: fitness.constraints,
  experiments,
  data,
});

function componentIds(node: UINode): string[] {
  const out: string[] = [];
  (function walk(n: UINode) {
    if (n.componentId) out.push(n.componentId);
    (n.children ?? []).forEach(walk);
    Object.values(n.slots ?? {}).flat().forEach(walk);
  })(node);
  return out;
}
function components(node: UINode): UINode[] {
  const out: UINode[] = [];
  (function walk(n: UINode) {
    if (n.type === "component") out.push(n);
    (n.children ?? []).forEach(walk);
    Object.values(n.slots ?? {}).flat().forEach(walk);
  })(node);
  return out;
}
const audienceOf = (id: string) => fitness.components.find((c) => c.id === id)!.contract.audience;
const ctx = (profile: SignalProfile, over: Partial<ValidateContext> = {}): ValidateContext => ({
  surface: "activity-detail",
  profile,
  data,
  experiments: [],
  ...over,
});

// pure social user: primary social, NO performance secondary
const pureSocial: SignalProfile = {
  ...clone(perf),
  subject: { anonId: "u_social_only" },
  preferences: { "ui.density": "comfortable" },
  archetype: { primary: "social", confidence: 0.9 },
  behavior: { "fitness.engagement.social.kudosRate": 0.6 },
};

function normalize(t: UITree): string {
  const c = clone(t);
  c.meta.generatedAt = "<ts>"; // the only non-deterministic field
  return JSON.stringify(c);
}

// --- determinism -----------------------------------------------------------

test("heuristic output is byte-stable for fixed inputs (modulo timestamp)", () => {
  assert.equal(normalize(composeHeuristic(req(perf))), normalize(composeHeuristic(req(perf))));
  assert.equal(normalize(composeHeuristic(req(pureSocial))), normalize(composeHeuristic(req(pureSocial))));
});

// --- eligibility correctness ----------------------------------------------

test("a pure social user gets no performance-only components", () => {
  const ids = componentIds(composeHeuristic(req(pureSocial)).root);
  for (const id of ids) {
    const aud = audienceOf(id);
    const performanceOnly = aud.length === 1 && aud[0] === "performance";
    assert.ok(!performanceOnly, `performance-only '${id}' leaked to a social user`);
  }
  // sanity: a social-facing component is present
  assert.ok(ids.includes("social-kudos-bar"));
});

test("no-consent output includes only neutral components", () => {
  const tree = composeHeuristic(req(noConsent));
  for (const id of componentIds(tree.root)) {
    assert.ok(audienceOf(id).includes("*"), `non-neutral '${id}' under no-consent`);
  }
  assert.ok(validateTree(tree, fitness, ctx(noConsent)).ok);
});

test("missing required data suppresses a non-neverHide component", () => {
  const partial = { ...data };
  delete (partial as Record<string, unknown>)["training.loadSeries"];
  const ids = componentIds(composeHeuristic({ ...req(perf), data: partial }).root);
  assert.ok(!ids.includes("training-load-chart"), "component with missing required data should be suppressed");
  assert.ok(ids.includes("activity-headline"), "neverHide stays");
});

test("a neverHide component with missing data is kept, and validation then fails clearly", () => {
  const partial = { ...data };
  delete (partial as Record<string, unknown>)["activity.headlineStat"];
  const tree = composeHeuristic({ ...req(perf), data: partial });
  assert.ok(componentIds(tree.root).includes("activity-headline"));
  const r = validateTree(tree, fitness, ctx(perf, { data: partial }));
  assert.ok(!r.ok);
  assert.ok(r.errors.some((e) => e.code === "data-not-in-bundle"));
});

// --- structured explanations ----------------------------------------------

test("every component carries a structured explanation with distinct reason kinds", () => {
  const tree = composeHeuristic(req(perf));
  for (const node of components(tree.root)) {
    const ex = node.explanation!;
    assert.ok(ex, `missing explanation for ${node.componentId}`);
    assert.ok(Array.isArray(ex.eligibility) && ex.eligibility.length > 0);
    assert.ok(Array.isArray(ex.nudges));
    assert.equal(typeof ex.basePriority, "number");
    assert.equal(typeof ex.score, "number");
  }
  // training-load-chart is nudged by archetype + behavior signals
  const chart = components(tree.root).find((n) => n.componentId === "training-load-chart")!;
  assert.ok(chart.explanation!.nudges.some((n) => n.signal === "archetype.primary"));
  assert.ok(chart.explanation!.score > chart.explanation!.basePriority);
  // neverHide headline records a fallback/constraint reason
  const headline = components(tree.root).find((n) => n.componentId === "activity-headline")!;
  assert.ok(headline.explanation!.constraints?.includes("neverHide") || headline.explanation!.fallbackReason);
});

test("explanations are byte-stable across runs", () => {
  const a = components(composeHeuristic(req(perf)).root).map((n) => n.explanation);
  const b = components(composeHeuristic(req(perf)).root).map((n) => n.explanation);
  assert.equal(JSON.stringify(a), JSON.stringify(b));
});

// --- cache keys ------------------------------------------------------------

test("cache key changes when the manifest version changes", () => {
  const base = { manifestVersion: "0.1.0", surface: "activity-detail", segment: "performance", experiments: [] };
  assert.notEqual(buildCacheKey(base), buildCacheKey({ ...base, manifestVersion: "0.2.0" }));
});

test("cache key changes when experiment assignments change", () => {
  const base = { manifestVersion: "0.1.0", surface: "activity-detail", segment: "performance", experiments: [] as ExperimentAssignment[] };
  assert.notEqual(
    buildCacheKey(base),
    buildCacheKey({ ...base, experiments: [{ experimentId: "exp.x", variant: "treatment" }] }),
  );
});

test("cache key never contains the raw user id or raw behavior values", () => {
  const key = composeHeuristic(req(perf)).meta.cacheKey;
  assert.ok(!key.includes(perf.subject.anonId), "anonId leaked into cache key");
  for (const v of Object.values(perf.behavior)) {
    assert.ok(!key.includes(String(v)), `raw behavior value ${v} leaked into cache key`);
  }
});

test("equivalent segment inputs produce equivalent cache keys (different users collide)", () => {
  const a: SignalProfile = { ...clone(perf), subject: { anonId: "user-A" }, behavior: { "fitness.engagement.charts.openRate": 0.9 } };
  const b: SignalProfile = { ...clone(perf), subject: { anonId: "user-B" }, behavior: { "fitness.engagement.charts.openRate": 0.2 } };
  assert.equal(composeHeuristic(req(a)).meta.cacheKey, composeHeuristic(req(b)).meta.cacheKey);
});

// --- configurable policy ---------------------------------------------------

test("policy: maxModules caps the layout while retaining neverHide/pinned", () => {
  const tree = composeHeuristic(req(perf), { maxModules: 2 });
  const ids = componentIds(tree.root);
  assert.ok(ids.length <= 2, `expected <= 2 modules, got ${ids.length}`);
  assert.ok(ids.includes("activity-headline"), "pinned/neverHide retained under the cap");
  assert.ok(validateTree(tree, fitness, ctx(perf)).ok);
});

test("policy: minConfidence treats a low-confidence archetype as cold (neutral only)", () => {
  const lowConf: SignalProfile = { ...clone(perf), archetype: { primary: "performance", confidence: 0.2 } };
  const ids = componentIds(composeHeuristic(req(lowConf), { minConfidence: 0.5 }).root);
  for (const id of ids) {
    assert.ok(audienceOf(id).includes("*"), `non-neutral '${id}' placed for a cold (low-confidence) user`);
  }
});
