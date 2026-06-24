import test from "node:test";
import assert from "node:assert/strict";
import { getSignal, evalCondition } from "@dynui/signal";
import { profiles } from "./helpers";

test("getSignal resolves nested and flat-map paths", () => {
  const p = profiles.performanceAthlete;
  assert.equal(getSignal(p, "archetype.primary"), "performance");
  assert.equal(getSignal(p, "context.device.platform"), "ios");
  assert.equal(getSignal(p, "behavior.fitness.engagement.charts.openRate"), 0.78);
  assert.equal(getSignal(p, "preferences.ui.density"), "compact");
  assert.equal(getSignal(p, "missing.path"), undefined);
});

test("evalCondition handles each operator", () => {
  const p = profiles.performanceAthlete;
  assert.ok(evalCondition(p, { signal: "archetype.primary", op: "eq", value: "performance" }));
  assert.ok(evalCondition(p, { signal: "behavior.fitness.engagement.charts.openRate", op: "gte", value: 0.5 }));
  assert.ok(!evalCondition(p, { signal: "behavior.fitness.engagement.charts.openRate", op: "lt", value: 0.5 }));
  assert.ok(evalCondition(p, { signal: "archetype.primary", op: "in", value: ["performance", "social"] }));
  assert.ok(evalCondition(p, { signal: "archetype.primary", op: "exists" }));
  assert.ok(!evalCondition(p, { signal: "archetype.primary", op: "neq", value: "performance" }));
});
