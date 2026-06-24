import test from "node:test";
import assert from "node:assert/strict";
import type { SignalProfile } from "@dynui/contracts";
import {
  validateTree,
  validateTreeStructure,
  validateRenderableTree,
} from "@dynui/validate";
import { composeHeuristic } from "@dynui/generate";
import { manifest, data, profiles, req, SURFACE } from "./helpers";

// A structurally-valid, archetype-targeted tree for a performance athlete.
function performanceTree() {
  return composeHeuristic(req(profiles.performanceAthlete));
}

test("validateTreeStructure passes a structurally-valid tree (no context needed)", () => {
  const tree = performanceTree();
  const r = validateTreeStructure(tree, manifest);
  assert.ok(r.ok, "manifest-only structural validation passes");
});

test("render gate REJECTS a consent violation that structural validation misses", () => {
  const tree = performanceTree();

  // Same subject, but the user has withdrawn personalization consent. The tree still
  // carries archetype-targeted components — structurally fine, but unsafe to render.
  const noConsent: SignalProfile = {
    ...profiles.performanceAthlete,
    consent: { personalization: false, analytics: false, modelTraining: false },
    archetype: undefined,
  };

  // Structural check is blind to consent → passes.
  assert.ok(validateTreeStructure(tree, manifest).ok, "structure-only is blind to consent");

  // Render gate sees consent → rejects.
  const r = validateRenderableTree(tree, manifest, {
    surface: SURFACE,
    profile: noConsent,
    data,
    experiments: [],
  });
  assert.ok(!r.ok, "render gate rejects a consent-violating tree");
  assert.ok(
    r.errors.some((e) => e.code === "consent-violation"),
    "consent-violation is reported",
  );
});

test("render gate REJECTS missing required data that structural validation misses", () => {
  const tree = performanceTree();

  // Structure-only doesn't know the resolved data bundle → passes.
  assert.ok(validateTreeStructure(tree, manifest).ok);

  // Render gate with an empty bundle → bound data is not present.
  const r = validateRenderableTree(tree, manifest, {
    surface: SURFACE,
    profile: profiles.performanceAthlete,
    data: {}, // nothing resolved
    experiments: [],
  });
  assert.ok(!r.ok, "render gate rejects when bound data is missing from the bundle");
  assert.ok(
    r.errors.some((e) => e.code === "data-not-in-bundle"),
    "data-not-in-bundle is reported",
  );
});

test("the named entry points delegate to validateTree (back-compat preserved)", () => {
  const tree = performanceTree();
  const ctx = { surface: SURFACE, profile: profiles.performanceAthlete, data, experiments: [] };
  assert.deepEqual(validateRenderableTree(tree, manifest, ctx), validateTree(tree, manifest, ctx));
  assert.deepEqual(validateTreeStructure(tree, manifest), validateTree(tree, manifest));
});

// --- the render gate REFUSES an incomplete context (it cannot silently weaken) ---

test("render gate throws when called with no context at all", () => {
  const tree = performanceTree();
  // @ts-expect-error — context is required; this is the runtime guard for JS callers / misuse.
  assert.throws(() => validateRenderableTree(tree, manifest), /requires a full render context/);
  // @ts-expect-error — undefined context must also throw, not validate weakly.
  assert.throws(() => validateRenderableTree(tree, manifest, undefined), /requires a full render context/);
});

test("render gate throws when an empty context object is passed", () => {
  const tree = performanceTree();
  // @ts-expect-error — {} is missing every required field.
  assert.throws(() => validateRenderableTree(tree, manifest, {}), /missing\/invalid: surface, profile, data, experiments/);
});

test("render gate throws for each individually missing required field", () => {
  const tree = performanceTree();
  const full = { surface: SURFACE, profile: profiles.performanceAthlete, data, experiments: [] };

  for (const field of ["surface", "profile", "data", "experiments"] as const) {
    const partial = { ...full };
    delete (partial as Record<string, unknown>)[field]; // runtime-incomplete context
    assert.throws(
      () => validateRenderableTree(tree, manifest, partial),
      new RegExp(field),
      `omitting '${field}' must throw`,
    );
  }
});

test("render gate throws on an empty-string surface (would silently skip eligibility)", () => {
  const tree = performanceTree();
  assert.throws(
    () => validateRenderableTree(tree, manifest, { surface: "", profile: profiles.performanceAthlete, data, experiments: [] }),
    /surface/,
  );
});

test("render gate ACCEPTS empty data/experiments (explicitly-empty is valid context)", () => {
  // A structurally trivial-but-valid tree isn't needed here; we only assert it does
  // NOT throw on context grounds when data={} and experiments=[] are explicit.
  const tree = performanceTree();
  assert.doesNotThrow(() =>
    validateRenderableTree(tree, manifest, {
      surface: SURFACE,
      profile: profiles.performanceAthlete,
      data: {},
      experiments: [],
    }),
  );
});
