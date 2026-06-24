import test from "node:test";
import assert from "node:assert/strict";
import {
  assignVariant,
  twoProportionPValue,
  ComponentExperimentEngine,
  type ExperimentDef,
} from "@dynui/experiments";
import { profiles } from "./helpers";

const exp: ExperimentDef = {
  id: "e",
  description: "test",
  segment: [{ signal: "archetype.primary", op: "eq", value: "performance" }],
  allocation: 1,
  variants: [
    { id: "control", weight: 0.5 },
    { id: "treatment", weight: 0.5 },
  ],
  goal: "g",
  guardrails: { minSamplesPerVariant: 50 },
};

test("off-segment users are not assigned", () => {
  assert.equal(assignVariant(exp, profiles.casualWellness), null);
});

test("assignment is deterministic and in-segment", () => {
  const v1 = assignVariant(exp, profiles.performanceAthlete);
  const v2 = assignVariant(exp, profiles.performanceAthlete);
  assert.equal(v1, v2);
  assert.ok(v1 === "control" || v1 === "treatment");
});

test("two-proportion p-value: equal rates high, divergent rates low", () => {
  assert.ok(twoProportionPValue(50, 100, 50, 100) > 0.5);
  assert.ok(twoProportionPValue(10, 100, 40, 100) < 0.05);
});

test("analyze recommends promote when treatment clearly wins with enough data", () => {
  const eng = new ComponentExperimentEngine([exp]);
  for (let i = 0; i < 200; i++) {
    eng.recordExposure("e", "control", `c${i}`);
    if (i < 30) eng.recordGoal("e", "control", `c${i}`);
    eng.recordExposure("e", "treatment", `t${i}`);
    if (i < 70) eng.recordGoal("e", "treatment", `t${i}`);
  }
  assert.equal(eng.analyze("e").recommendation, "promote");
});

test("analyze keeps running below the sample guardrail", () => {
  const eng = new ComponentExperimentEngine([exp]);
  eng.recordExposure("e", "control", "c1");
  eng.recordExposure("e", "treatment", "t1");
  assert.equal(eng.analyze("e").recommendation, "keep-running");
});
