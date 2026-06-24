import test from "node:test";
import assert from "node:assert/strict";
import type { GenerationResult, ModelProvider } from "@dynui/contracts";
import { composeHeuristic, generateScreen } from "@dynui/generate";
import { componentIds, profiles, req } from "./helpers";

test("neverHide component is always present", () => {
  const tree = composeHeuristic(req(profiles.casualWellness));
  assert.ok(componentIds(tree.root).includes("activity-headline"));
});

test("experiment gating: excluded without assignment, included with it", () => {
  const without = componentIds(composeHeuristic(req(profiles.performanceAthlete)).root);
  assert.ok(!without.includes("strength-volume-card"));

  const withAssignment = componentIds(
    composeHeuristic(
      req(profiles.performanceAthlete, [{ experimentId: "exp.strength-volume", variant: "treatment" }]),
    ).root,
  );
  assert.ok(withAssignment.includes("strength-volume-card"));
});

test("consent: no personalization yields a neutral screen", () => {
  const p = structuredClone(profiles.performanceAthlete);
  p.consent.personalization = false;
  const list = componentIds(composeHeuristic(req(p)).root);
  assert.ok(list.includes("activity-headline"));
  assert.ok(!list.includes("training-load-chart"), "performance-only component must be suppressed");
});

const invalidProvider: ModelProvider = {
  id: "test:invalid",
  async generate(): Promise<GenerationResult> {
    return {
      tree: {
        schemaVersion: "ui-tree/1.0",
        surface: "activity-detail",
        generatedFor: { anonId: "x" },
        meta: { generatedAt: "", model: "test", cacheKey: "", experiments: [], fallback: false },
        root: { type: "screen", children: [{ type: "component", componentId: "nope" }] },
      },
    };
  },
};

const throwingProvider: ModelProvider = {
  id: "test:throws",
  async generate(): Promise<GenerationResult> {
    throw new Error("boom");
  },
};

test("orchestrator falls back (and stays valid) on invalid provider output", async () => {
  const res = await generateScreen(invalidProvider, req(profiles.performanceAthlete));
  assert.ok(res.usedFallback);
  assert.ok(res.validation.ok);
});

test("orchestrator falls back when the provider throws", async () => {
  const res = await generateScreen(throwingProvider, req(profiles.performanceAthlete));
  assert.ok(res.usedFallback);
  assert.ok(res.validation.ok);
});
