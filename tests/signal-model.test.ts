import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { ComponentManifest, SignalModel, SignalProfile } from "@dynui/contracts";
import { parseSignalModel } from "@dynui/contracts";
import { inferSegment, applyDecay } from "@dynui/signal";
import { aggregateBehavior, inferArchetype, DEFAULT_FITNESS_SIGNAL_MODEL } from "@dynui/telemetry";
import type { BehaviorEvent } from "@dynui/telemetry";

const root = join(import.meta.dirname, "..");
const rj = (p: string) => JSON.parse(readFileSync(join(root, p), "utf8"));
const clone = <T>(x: T): T => structuredClone(x);

const fitnessModel = rj("examples/fitness/signal-model.json") as SignalModel;
const newsModel = rj("tests/fixtures/domains/news/signal-model.json") as SignalModel;
const newsProfile = rj("tests/fixtures/domains/news/profile.json") as SignalProfile;
const manifest = rj("examples/fitness/manifest.example.json") as ComponentManifest;
const perf = rj("tests/fixtures/profiles/valid/performance.json") as SignalProfile;
const social = rj("tests/fixtures/profiles/valid/social.json") as SignalProfile;

// --- schema validation -----------------------------------------------------

test("the fitness and news signal models are schema-valid", () => {
  assert.ok(parseSignalModel(fitnessModel).ok);
  assert.ok(parseSignalModel(newsModel).ok);
});

test("signal model schema rejects missing weights, bad thresholds, unknown operators", () => {
  const noWeight = clone(fitnessModel);
  delete (noWeight.segments[0].signals[0] as unknown as Record<string, unknown>).weight;
  assert.ok(!parseSignalModel(noWeight).ok, "missing weight rejected");

  const badThreshold = clone(fitnessModel);
  badThreshold.minConfidence = 1.8;
  assert.ok(!parseSignalModel(badThreshold).ok, "out-of-range threshold rejected");

  const badOp = clone(fitnessModel);
  (badOp.segments[0].signals[0] as unknown as Record<string, unknown>).op = "bogus";
  assert.ok(!parseSignalModel(badOp).ok, "unknown operator rejected");

  const dupSeg = clone(fitnessModel);
  dupSeg.segments.push({ id: "performance", signals: [{ signal: "x", weight: 1 }] });
  assert.ok(!parseSignalModel(dupSeg).ok, "duplicate segment id rejected");
});

// --- inference -------------------------------------------------------------

test("the fitness signal model reproduces the demo archetypes", () => {
  for (const p of [perf, social]) {
    const seg = inferSegment(p, fitnessModel)!;
    const legacy = inferArchetype(p.behavior, DEFAULT_FITNESS_SIGNAL_MODEL)!;
    assert.equal(seg.primary, legacy.primary, "same primary segment");
    assert.equal(seg.confidence, legacy.confidence, "same confidence");
  }
  assert.equal(inferSegment(perf, fitnessModel)!.primary, "performance");
  assert.equal(inferSegment(social, fitnessModel)!.primary, "social");
});

test("a second (news) domain infers segments with no core code changes", () => {
  const seg = inferSegment(newsProfile, newsModel);
  assert.ok(seg, "news profile yields a segment");
  assert.equal(seg!.primary, "reader");
});

test("low / no evidence yields neutral (or cold-start) output", () => {
  const empty: SignalProfile = { ...clone(perf), behavior: {}, preferences: {} };
  // fitness has no cold-start segment -> undefined (engine treats as neutral)
  assert.equal(inferSegment(empty, fitnessModel), undefined);
  // news declares a cold-start segment -> that segment at confidence 0
  const emptyNews: SignalProfile = { ...clone(newsProfile), behavior: {}, preferences: {} };
  assert.deepEqual(inferSegment(emptyNews, newsModel), { primary: "skimmer", confidence: 0 });
});

test("explicit preference overrides inferred behavior", () => {
  // performance behavior, but the user explicitly declares "social"
  const p = clone(perf);
  p.preferences = { ...p.preferences, "fitness.segment": "social" };
  const seg = inferSegment(p, fitnessModel)!;
  assert.equal(seg.primary, "social");
  assert.equal(seg.confidence, 1);
});

// --- update semantics ------------------------------------------------------

test("stale behavior decays toward neutral according to policy", () => {
  const behavior = { "behavior.fitness.engagement.charts.openRate": 0.8 };
  const oneHalfLife = applyDecay(behavior, fitnessModel.decay!.halfLifeMs, fitnessModel.decay!.halfLifeMs);
  assert.ok(Math.abs(oneHalfLife["behavior.fitness.engagement.charts.openRate"] - 0.4) < 1e-6, "halved after one half-life");
  const fresh = applyDecay(behavior, 0, fitnessModel.decay!.halfLifeMs);
  assert.equal(fresh["behavior.fitness.engagement.charts.openRate"], 0.8, "no decay at age 0");
});

test("duplicate events do not inflate behavior (idempotent aggregation)", () => {
  const ev = (id: string, type: BehaviorEvent["type"]): BehaviorEvent => ({
    id,
    type,
    anonId: "a",
    surface: "activity-detail",
    componentId: "training-load-chart",
    ts: "2026-06-20T00:00:00Z",
  });
  const unique = [ev("e1", "exposure"), ev("e2", "exposure"), ev("e3", "tap")];
  const withDupes = [...unique, ev("e1", "exposure"), ev("e3", "tap")]; // re-delivered
  assert.deepEqual(
    aggregateBehavior(withDupes, manifest),
    aggregateBehavior(unique, manifest),
    "re-delivered events produce the same aggregate",
  );
});
