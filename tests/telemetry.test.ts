import test from "node:test";
import assert from "node:assert/strict";
import type { BehaviorEvent } from "@dynui/telemetry";
import { aggregateBehavior, inferArchetype, applyBehavior } from "@dynui/telemetry";
import { manifest, profiles } from "./helpers";

const ev = (type: BehaviorEvent["type"], componentId: string): BehaviorEvent => ({
  type,
  anonId: "x",
  surface: "activity-detail",
  componentId,
  ts: "",
});

test("aggregateBehavior computes tap/exposure rates per signal", () => {
  const events = [
    ev("exposure", "training-load-chart"),
    ev("exposure", "training-load-chart"),
    ev("tap", "training-load-chart"),
    ev("exposure", "social-kudos-bar"),
  ];
  const agg = aggregateBehavior(events, manifest);
  assert.equal(agg["fitness.engagement.charts.openRate"], 0.5);
  assert.equal(agg["fitness.engagement.social.kudosRate"], 0);
});

test("inferArchetype picks the dominant signal", () => {
  assert.equal(
    inferArchetype({
      "fitness.engagement.charts.openRate": 0.8,
      "fitness.engagement.social.kudosRate": 0.1,
    })?.primary,
    "performance",
  );
  assert.equal(inferArchetype({}), undefined);
});

test("applyBehavior merges signals and re-infers archetype", () => {
  const cold = { ...structuredClone(profiles.performanceAthlete), behavior: {}, archetype: undefined };
  const warm = applyBehavior(cold, { "fitness.engagement.social.kudosRate": 0.9 });
  assert.equal(warm.archetype?.primary, "social");
  assert.equal(warm.behavior["fitness.engagement.social.kudosRate"], 0.9);
});
