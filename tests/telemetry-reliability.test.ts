import test from "node:test";
import assert from "node:assert/strict";
import type { BehaviorEvent } from "@dynui/telemetry";
import {
  BatchingLogger,
  arraySink,
  buildExposureEvents,
  renderErrorEvent,
  tapEvent,
  type EventContext,
} from "@dynui/telemetry";
import {
  ComponentExperimentEngine,
  InMemoryEventSink,
  assignVariant,
  srmPValue,
  type AssignmentAdapter,
  type ExperimentDef,
} from "@dynui/experiments";
import type { SignalProfile } from "@dynui/contracts";

const ctx: EventContext = { anonId: "anon_1", surface: "activity-detail", generationId: "gen_1", treeKey: "k", ts: "2026-06-20T00:00:00Z" };

// --- exposure correctness --------------------------------------------------

test("exposure is recorded once per rendered component per generation", () => {
  const rendered = [{ componentId: "activity-headline" }, { componentId: "training-load-chart" }];
  const a = buildExposureEvents(rendered, ctx);
  const b = buildExposureEvents(rendered, ctx); // re-report (e.g. re-mount)
  const ids = new Set([...a, ...b].map((e) => e.id));
  assert.equal(ids.size, 2, "deduped to once per rendered component per generation");
  assert.ok(a.every((e) => e.type === "exposure"));
});

test("suppressed components never get an exposure event", () => {
  const rendered = [{ componentId: "activity-headline" }]; // chart was suppressed
  const ids = buildExposureEvents(rendered, ctx).map((e) => e.componentId);
  assert.ok(!ids.includes("training-load-chart"));
});

test("a failed component records a render-error, not an exposure", () => {
  const e = renderErrorEvent({ componentId: "training-load-chart" }, ctx);
  assert.equal(e.type, "render-error");
  assert.notEqual(e.type, "exposure");
});

// --- external sink contract ------------------------------------------------

test("events delivered to a sink carry the required fields", async () => {
  const out: BehaviorEvent[] = [];
  const logger = new BatchingLogger(arraySink(out), 1);
  logger.log(tapEvent({ componentId: "training-load-chart" }, ctx));
  for (const ev of buildExposureEvents([{ componentId: "activity-headline" }], ctx)) logger.log(ev);
  await logger.flush();
  assert.ok(out.length >= 2);
  for (const e of out) {
    assert.ok(e.type && e.anonId && e.surface && e.ts, "type/anonId/surface/ts present");
    assert.equal(e.generationId, "gen_1");
  }
});

// --- assignment ------------------------------------------------------------

const exp = (over: Partial<ExperimentDef> = {}): ExperimentDef => ({
  id: "exp.demo",
  description: "d",
  segment: [],
  allocation: 1,
  variants: [{ id: "control", weight: 1 }, { id: "treatment", weight: 1 }],
  goal: "engagement",
  ...over,
});
const profile = (anonId: string): SignalProfile =>
  ({ subject: { anonId }, consent: { personalization: true, analytics: true, modelTraining: false }, behavior: {}, preferences: {}, traits: {} }) as SignalProfile;

test("assignment is stable for a fixed user and experiment", () => {
  const e = exp();
  const p = profile("user-42");
  const first = assignVariant(e, p);
  assert.equal(assignVariant(e, p), first);
  assert.equal(assignVariant(e, p), first);
  assert.ok(first === "control" || first === "treatment");
});

test("an injected AssignmentAdapter overrides built-in bucketing", () => {
  const adapter: AssignmentAdapter = { assign: () => "treatment" };
  const engine = new ComponentExperimentEngine([exp()], new InMemoryEventSink(), { assignmentAdapter: adapter });
  assert.equal(engine.assign("exp.demo", profile("anyone")), "treatment");
});

// --- guardrails ------------------------------------------------------------

test("SRM p-value is high when balanced, low when materially imbalanced", () => {
  assert.ok(srmPValue([500, 500], [1, 1]) > 0.5);
  assert.ok(srmPValue([700, 300], [1, 1]) < 0.01);
});

test("a sample-ratio mismatch blocks a decision (keep-running)", () => {
  const sink = new InMemoryEventSink();
  const engine = new ComponentExperimentEngine([exp({ guardrails: { srmMaxPValue: 0.001 } })], sink);
  // Imbalanced exposures + a clear treatment win that would otherwise promote.
  for (let i = 0; i < 700; i++) { sink.recordExposure("exp.demo", "control", `c${i}`); if (i < 70) sink.recordGoal("exp.demo", "control", `c${i}`); }
  for (let i = 0; i < 300; i++) { sink.recordExposure("exp.demo", "treatment", `t${i}`); if (i < 120) sink.recordGoal("exp.demo", "treatment", `t${i}`); }
  const r = engine.analyze("exp.demo");
  assert.ok(!r.srm.ok, "SRM detected");
  assert.equal(r.recommendation, "keep-running");
});

test("a guardrail-metric regression recommends rollback", () => {
  const sink = new InMemoryEventSink();
  const engine = new ComponentExperimentEngine(
    [exp({ guardrails: { minSamplesPerVariant: 100, metrics: [{ metric: "bounce", maxRegressionPct: 0.1 }] } })],
    sink,
  );
  for (let i = 0; i < 200; i++) {
    sink.recordExposure("exp.demo", "control", `c${i}`);
    sink.recordExposure("exp.demo", "treatment", `t${i}`);
    sink.recordGoal("exp.demo", "control", `c${i}`); // equal primary metric (tie)
    sink.recordGoal("exp.demo", "treatment", `t${i}`);
    if (i < 10) sink.recordGuardrail("exp.demo", "control", `c${i}`, "bounce");
    if (i < 80) sink.recordGuardrail("exp.demo", "treatment", `t${i}`, "bounce"); // big regression
  }
  const r = engine.analyze("exp.demo");
  assert.ok(!r.guardrails.ok);
  assert.equal(r.recommendation, "rollback");
});

test("below minimum runtime, the engine keeps running even on a winning result", () => {
  const sink = new InMemoryEventSink();
  const started = "2026-06-20T00:00:00Z";
  const engine = new ComponentExperimentEngine(
    [exp({ startedAt: started, guardrails: { minSamplesPerVariant: 50, minRuntimeMs: 7 * 24 * 3600 * 1000 } })],
    sink,
  );
  for (let i = 0; i < 200; i++) { sink.recordExposure("exp.demo", "control", `c${i}`); sink.recordExposure("exp.demo", "treatment", `t${i}`); if (i < 20) sink.recordGoal("exp.demo", "control", `c${i}`); if (i < 120) sink.recordGoal("exp.demo", "treatment", `t${i}`); }
  const now = new Date(started).getTime() + 60_000; // only a minute in
  const r = engine.analyze("exp.demo", { now });
  assert.ok(!r.runtimeOk);
  assert.equal(r.recommendation, "keep-running");
});

test("segment breakdown is produced when segment data is present", () => {
  const sink = new InMemoryEventSink();
  const engine = new ComponentExperimentEngine([exp({ guardrails: { minSamplesPerVariant: 1 } })], sink);
  sink.recordExposure("exp.demo", "control", "c1", "performance");
  sink.recordExposure("exp.demo", "treatment", "t1", "performance");
  sink.recordGoal("exp.demo", "treatment", "t1", "performance");
  const r = engine.analyze("exp.demo");
  assert.ok(r.segments?.performance, "per-segment result present");
});
