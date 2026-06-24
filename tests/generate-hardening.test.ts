import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type {
  ComponentManifest,
  GenerationRequest,
  GenerationResult,
  JsonValue,
  ModelProvider,
  SignalProfile,
  UITree,
} from "@dynui/contracts";
import { generateScreen, composeHeuristic, parseTree } from "@dynui/generate";

const root = join(import.meta.dirname, "..");
const rj = (p: string) => JSON.parse(readFileSync(join(root, p), "utf8"));
const manifest = rj("examples/fitness/manifest.example.json") as ComponentManifest;
const data = rj("examples/fitness/sample-activity.json") as Record<string, JsonValue>;
const perf = rj("tests/fixtures/profiles/valid/performance.json") as SignalProfile;

const req: GenerationRequest = {
  surface: "activity-detail",
  profile: perf,
  manifest,
  constraints: manifest.constraints,
  experiments: [],
  data,
};

const validTree = (): UITree => composeHeuristic(req);
const invalidTree = (): UITree => {
  const t = composeHeuristic(req);
  (t.root.children![0].children![0] as { componentId?: string }).componentId = "ghost-component";
  return t;
};

const provider = (gen: ModelProvider["generate"], id = "mock"): ModelProvider => ({ id, generate: gen });

// --- failure modes all yield a VALID fallback ------------------------------

test("a throwing provider falls back to a valid tree", async () => {
  const r = await generateScreen(provider(async () => { throw new Error("boom sk-ant-secret123456"); }), req);
  assert.ok(r.usedFallback);
  assert.ok(r.validation.ok, "fallback is valid");
  assert.equal(r.diagnostics.outcome, "fallback");
  assert.ok(!r.tree.meta.model.includes("sk-ant-secret123456"), "provider secret redacted from diagnostics");
});

test("a malformed-JSON provider falls back", async () => {
  const r = await generateScreen(provider(async () => ({ tree: parseTree("no json here") } as GenerationResult)), req);
  assert.ok(r.usedFallback && r.validation.ok);
});

test("an invalid-output provider falls back after exhausting repairs", async () => {
  const r = await generateScreen(provider(async () => ({ tree: invalidTree() })), req, { maxRepairs: 1 });
  assert.ok(r.usedFallback && r.validation.ok);
  assert.ok(r.diagnostics.validationErrorCodes.includes("unknown-component"), "error distribution captured");
});

test("a timeout provider falls back within the latency budget", async () => {
  const slow = provider((_req) => new Promise<GenerationResult>((res) => setTimeout(() => res({ tree: validTree() }), 5000)));
  const t0 = Date.now();
  const r = await generateScreen(slow, req, { timeoutMs: 50 });
  assert.ok(r.usedFallback && r.validation.ok);
  assert.ok(Date.now() - t0 < 1500, "fell back well within budget, did not wait 5s");
});

// --- repair ----------------------------------------------------------------

test("an invalid-but-repairable provider succeeds after repair (and stays valid)", async () => {
  let call = 0;
  const repairable = provider(async (r) => {
    call++;
    return { tree: r.options?.repairErrors?.length ? validTree() : invalidTree() };
  });
  const r = await generateScreen(repairable, req, { maxRepairs: 1 });
  assert.ok(!r.usedFallback, "did not need fallback");
  assert.ok(r.validation.ok, "repaired output passes the strict validator");
  assert.equal(r.diagnostics.outcome, "repaired");
  assert.equal(call, 2);
});

test("an invalid-after-repair provider falls back", async () => {
  const r = await generateScreen(provider(async () => ({ tree: invalidTree() })), req, { maxRepairs: 2 });
  assert.ok(r.usedFallback && r.validation.ok);
  assert.equal(r.attempts, 3, "tried initial + 2 repairs");
});

// --- normalization ---------------------------------------------------------

test("an oversized tree is rejected and falls back", async () => {
  const big = provider(async () => {
    const t = validTree();
    const filler = Array.from({ length: 50 }, () => ({ type: "component" as const, componentId: "insight-card", dataBindings: { "insight.headline": "insight.headline", "insight.body": "insight.body" } }));
    t.root.children!.push({ type: "section", label: "spam", children: filler });
    return { tree: t };
  });
  const r = await generateScreen(big, req, { limits: { maxComponents: 12 } });
  assert.ok(r.usedFallback && r.validation.ok);
  assert.ok(r.diagnostics.fallbackReason?.includes("normalization"));
});

test("an unknown node type is rejected and falls back", async () => {
  const weird = provider(async () => {
    const t = validTree();
    (t.root.children as unknown[]).push({ type: "carousel", componentId: "x" });
    return { tree: t };
  });
  const r = await generateScreen(weird, req);
  assert.ok(r.usedFallback && r.validation.ok);
});

test("unknown node FIELDS are stripped, not fatal", async () => {
  const messy = provider(async () => {
    const t = validTree();
    (t.root.children![0].children![0] as unknown as Record<string, unknown>).hackerField = "<script>alert(1)</script>";
    return { tree: t };
  });
  const r = await generateScreen(messy, req);
  assert.ok(!r.usedFallback, "stripping an unknown field is non-fatal");
  assert.ok(r.validation.ok);
});

// --- fallback validity is a real guarantee (Phase 2) -----------------------

const throwing = provider(async () => { throw new Error("provider down"); });
const componentIds = (t: UITree): string[] => {
  const out: string[] = [];
  (function rec(n: { type: string; componentId?: string; children?: unknown[]; slots?: Record<string, unknown[]> }) {
    if (n.type === "component" && n.componentId) out.push(n.componentId);
    (n.children ?? []).forEach((c) => rec(c as never));
    Object.values(n.slots ?? {}).flat().forEach((c) => rec(c as never));
  })(t.root as never);
  return out;
};

test("missing data for a non-neverHide component suppresses it and the fallback stays valid", async () => {
  // training-load-chart is NOT neverHide; drop its required series.
  const { ["training.loadSeries"]: _omit, ...thin } = data;
  const r = await generateScreen(throwing, { ...req, data: thin as Record<string, JsonValue> });
  assert.ok(r.usedFallback);
  assert.ok(r.validation.ok, "fallback is valid with the data-starved component suppressed");
  assert.ok(!r.unrenderable, "a suppressible component does not make the screen unrenderable");
  assert.ok(!componentIds(r.tree).includes("training-load-chart"), "data-starved optional component is absent");
});

test("missing required data for a neverHide component is renderable when fallbackData supplies it", async () => {
  // activity-headline is neverHide and requires activity.headlineStat.
  const { ["activity.headlineStat"]: _omit, ...thin } = data;
  const r = await generateScreen(throwing, {
    ...req,
    data: thin as Record<string, JsonValue>,
    options: { fallbackData: { "activity.headlineStat": "—" } },
  });
  assert.ok(r.usedFallback);
  assert.ok(r.validation.ok, "fallbackData makes the neverHide component renderable");
  assert.ok(!r.unrenderable);
  assert.ok(componentIds(r.tree).includes("activity-headline"), "neverHide component present");
});

test("a neverHide component with missing baseline data and no fallbackData yields a typed non-renderable result", async () => {
  const { ["activity.headlineStat"]: _omit, ...thin } = data;
  const r = await generateScreen(throwing, { ...req, data: thin as Record<string, JsonValue> });
  assert.equal(r.unrenderable, true, "explicit non-renderable branch, not a renderable-looking screen");
  assert.equal(r.validation.ok, false, "and it honestly reports invalid");
  assert.ok(
    r.diagnostics.fallbackReason?.startsWith("missing-required-baseline-data"),
    "stable diagnostic reason",
  );
});

test("INVARIANT: generateScreen never returns a renderable result with validation.ok === false", async () => {
  // Across every failure shape, any invalid result must be flagged unrenderable.
  const { ["activity.headlineStat"]: _omit, ...thin } = data;
  const cases: GenerationRequest[] = [
    req,
    { ...req, data: thin as Record<string, JsonValue> },
    { ...req, data: thin as Record<string, JsonValue>, options: { fallbackData: { "activity.headlineStat": "—" } } },
  ];
  for (const c of cases) {
    const r = await generateScreen(throwing, c);
    if (!r.validation.ok) assert.equal(r.unrenderable, true, "invalid result must be marked unrenderable");
    if (!r.unrenderable) assert.equal(r.validation.ok, true, "renderable result must be valid");
  }
});

// --- happy path diagnostics ------------------------------------------------

test("a valid provider returns first-try with diagnostics", async () => {
  const r = await generateScreen(provider(async () => ({ tree: validTree(), usage: { inputTokens: 100, outputTokens: 200 } })), req);
  assert.ok(!r.usedFallback);
  assert.equal(r.diagnostics.outcome, "first-try");
  assert.equal(r.usage?.outputTokens, 200);
  assert.equal(typeof r.diagnostics.latencyMs, "number");
});
