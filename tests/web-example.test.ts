/**
 * Guards the browser example (examples/web). It imports the same buildScreen the
 * server serves, so this test drifts with the example — if the fitness manifest,
 * signal model, or pipeline change in a way that breaks the demo, CI catches it.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { buildScreen, PRESETS } from "../examples/web/pipeline.js";

const ids = (tree: { root: unknown }) => {
  const out: string[] = [];
  (function walk(n: any) {
    if (!n) return;
    if (n.componentId) out.push(n.componentId);
    (n.children ?? []).forEach(walk);
    Object.values(n.slots ?? {})
      .flat()
      .forEach(walk);
  })(tree.root);
  return out;
};

test("each preset infers its segment and produces a valid, distinct screen", async () => {
  // A component only the given archetype should surface.
  const signature: Record<string, string> = {
    performance: "training-load-chart",
    wellness: "route-map-hero",
    social: "social-kudos-bar",
  };
  for (const [name, behavior] of Object.entries(PRESETS)) {
    const res = await buildScreen({ behavior, personalization: true });
    assert.equal(res.validation.ok, true, `${name} validates`);
    assert.equal(res.segment.primary, name, `${name} infers its segment`);
    const componentIds = ids(res.tree);
    assert.ok(componentIds.includes("activity-headline"), `${name} keeps the anchor`);
    assert.ok(
      componentIds.includes(signature[name]),
      `${name} gets ${signature[name]}`,
    );
  }
});

test("withdrawing personalisation consent yields a neutral, valid screen", async () => {
  const res = await buildScreen({
    behavior: PRESETS.performance,
    personalization: false,
  });
  assert.equal(res.validation.ok, true, "neutral screen still validates");
  assert.equal(
    res.tree.generatedFor.archetype,
    undefined,
    "no archetype is applied without consent",
  );
  const componentIds = ids(res.tree);
  assert.ok(componentIds.includes("activity-headline"), "keeps the anchor");
  assert.ok(
    !componentIds.includes("training-load-chart"),
    "no performance-only component without consent",
  );
});

test("priority cannot summon an out-of-audience component (bounded generation)", async () => {
  // A social athlete, even if a performance-only chart is boosted, must not get
  // it — audience gating bounds what priority can do.
  const res = await buildScreen({
    behavior: PRESETS.social,
    personalization: true,
    priorityOverrides: { "training-load-chart": 200 },
  });
  assert.equal(res.validation.ok, true);
  assert.ok(!ids(res.tree).includes("training-load-chart"));
});
