import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type {
  ComponentManifest,
  JsonValue,
  SignalProfile,
  UINode,
  UITree,
  ValidationCode,
} from "@dynui/contracts";
import { validateTree, type ValidateContext } from "@dynui/validate";

const root = join(import.meta.dirname, "..");
const rj = (p: string) => JSON.parse(readFileSync(join(root, p), "utf8"));
const clone = <T>(x: T): T => structuredClone(x);

const fitness = rj("examples/fitness/manifest.example.json") as ComponentManifest;
const data = rj("examples/fitness/sample-activity.json") as Record<string, JsonValue>;
const perf = rj("tests/fixtures/profiles/valid/performance.json") as SignalProfile;
const wellness = rj("tests/fixtures/profiles/valid/wellness.json") as SignalProfile;
const noConsent = rj("tests/fixtures/profiles/valid/no-consent.json") as SignalProfile;
const a11yM = rj("tests/fixtures/manifests/valid/a11y-props.json") as ComponentManifest;
const flat = rj("tests/fixtures/trees/valid/flat-performance.json") as UITree;

const baseCtx = (over: Partial<ValidateContext> = {}): ValidateContext => ({
  profile: perf,
  surface: "activity-detail",
  data,
  experiments: [],
  ...over,
});

function expectCode(r: { ok: boolean; errors: { code: string }[] }, code: ValidationCode) {
  assert.ok(!r.ok, `expected failure with ${code}, but tree validated`);
  assert.ok(
    r.errors.some((e) => e.code === code),
    `expected ${code}, got: ${r.errors.map((e) => e.code).join(", ") || "(none)"}`,
  );
}

/** Build a component node binding every required (and present-optional) data key. */
function mkNode(m: ComponentManifest, id: string, dataBundle: Record<string, JsonValue>, extra: Partial<UINode> = {}): UINode {
  const def = m.components.find((c) => c.id === id)!;
  return {
    type: "component",
    componentId: id,
    variant: def.variants[0]?.id,
    dataBindings: Object.fromEntries(
      def.data.filter((d) => d.required || dataBundle[d.key] !== undefined).map((d) => [d.key, d.key]),
    ),
    ...extra,
  };
}

function mkScreen(surface: string, anonId: string, children: UINode[], over: Partial<UITree> = {}): UITree {
  return {
    schemaVersion: "ui-tree/1.0",
    surface,
    generatedFor: { anonId },
    meta: { generatedAt: "2026-06-20T00:00:00.000Z", model: "test", cacheKey: "k", experiments: [], fallback: false },
    root: { type: "screen", children },
    ...over,
  };
}

// --- positive baseline -----------------------------------------------------

test("strict: a valid on-contract screen passes with full context", () => {
  assert.ok(validateTree(flat, fitness, baseCtx()).ok);
});

test("strict: a root mixing sections and direct components is rejected (mixed-root-children)", () => {
  const section: UINode = { type: "section", label: "above-the-fold", children: [mkNode(fitness, "activity-headline", data)] };
  const direct = mkNode(fitness, "insight-card", data);
  const tree = mkScreen("activity-detail", perf.subject.anonId, [section, direct]);
  expectCode(validateTree(tree, fitness, baseCtx()), "mixed-root-children");
});

test("strict: an all-section root and an all-component root both pass the root-shape rule", () => {
  const allSection = mkScreen("activity-detail", perf.subject.anonId, [
    { type: "section", label: "above-the-fold", children: [mkNode(fitness, "activity-headline", data)] },
  ]);
  assert.ok(!validateTree(allSection, fitness).errors.some((e) => e.code === "mixed-root-children"));
  const allComponent = mkScreen("activity-detail", perf.subject.anonId, [mkNode(fitness, "activity-headline", data)]);
  assert.ok(!validateTree(allComponent, fitness).errors.some((e) => e.code === "mixed-root-children"));
});

test("every validator error carries a stable code, a node path, and a message", () => {
  const t = clone(flat);
  t.surface = "activity-log";
  const r = validateTree(t, fitness, baseCtx());
  assert.ok(!r.ok);
  for (const e of r.errors) {
    assert.equal(typeof e.code, "string");
    assert.ok(e.nodePath && e.nodePath.length > 0);
    assert.ok(e.message && e.message.length > 0);
  }
});

// --- root & metadata invariants -------------------------------------------

test("strict: root must be a screen", () => {
  const t = clone(flat);
  (t.root as UINode).type = "section";
  expectCode(validateTree(t, fitness, baseCtx()), "root-not-screen");
});

test("strict: surface mismatch fails", () => {
  const t = clone(flat);
  t.surface = "activity-log";
  expectCode(validateTree(t, fitness, baseCtx()), "surface-mismatch");
});

test("strict: subject mismatch fails", () => {
  const t = clone(flat);
  t.generatedFor.anonId = "someone-else";
  expectCode(validateTree(t, fitness, baseCtx()), "subject-mismatch");
});

test("strict: experiments mismatch fails", () => {
  expectCode(
    validateTree(clone(flat), fitness, baseCtx({ experiments: [{ experimentId: "exp.z", variant: "treatment" }] })),
    "experiments-mismatch",
  );
});

test("strict: fallback-flag dishonesty fails", () => {
  expectCode(validateTree(clone(flat), fitness, baseCtx({ expectFallback: true })), "fallback-flag-mismatch");
});

// --- eligibility -----------------------------------------------------------

test("strict: off-surface component is ineligible", () => {
  const t = mkScreen("activity-log", perf.subject.anonId, [
    mkNode(fitness, "activity-headline", data),
    mkNode(fitness, "training-load-chart", data),
  ]);
  expectCode(validateTree(t, fitness, baseCtx({ surface: "activity-log" })), "surface-ineligible");
});

test("strict: off-audience component is ineligible", () => {
  const t = mkScreen("activity-detail", wellness.subject.anonId, [
    mkNode(fitness, "activity-headline", data),
    mkNode(fitness, "hr-zone-breakdown", data), // audience: performance only
  ]);
  expectCode(validateTree(t, fitness, baseCtx({ profile: wellness })), "audience-ineligible");
});

test("strict: a hard (unweighted) showWhen that fails is rejected", () => {
  const m = clone(fitness);
  m.components.find((c) => c.id === "insight-card")!.contract.showWhen = [
    { signal: "traits.fitness.experienceLevel", op: "eq", value: "pro" }, // no weight = hard gate
  ];
  const t = mkScreen("activity-detail", perf.subject.anonId, [
    mkNode(m, "activity-headline", data),
    mkNode(m, "insight-card", data),
  ]);
  expectCode(validateTree(t, m, baseCtx()), "show-when-failed");
});

test("strict: a passing hideWhen suppresses (placing it is a violation)", () => {
  const m = clone(fitness);
  m.components.find((c) => c.id === "insight-card")!.contract.hideWhen = [
    { signal: "archetype.primary", op: "eq", value: "performance" },
  ];
  const t = mkScreen("activity-detail", perf.subject.anonId, [
    mkNode(m, "activity-headline", data),
    mkNode(m, "insight-card", data),
  ]);
  expectCode(validateTree(t, m, baseCtx()), "hide-when-violated");
});

test("strict: no-consent screen cannot carry an archetype-restricted component", () => {
  const t = mkScreen("activity-detail", noConsent.subject.anonId, [
    mkNode(fitness, "activity-headline", data),
    mkNode(fitness, "training-load-chart", data),
  ]);
  expectCode(validateTree(t, fitness, baseCtx({ profile: noConsent })), "consent-violation");
});

test("strict: neverHide components are exempt from eligibility (still render under no consent)", () => {
  // activity-headline is audience ["*"] AND neverHide; a no-consent screen of just
  // headline + neutral insight must pass.
  const t = mkScreen("activity-detail", noConsent.subject.anonId, [
    mkNode(fitness, "activity-headline", data),
    mkNode(fitness, "insight-card", data),
  ]);
  assert.ok(validateTree(t, fitness, baseCtx({ profile: noConsent })).ok);
});

// --- data semantics --------------------------------------------------------

test("strict: bound data missing from the bundle fails", () => {
  const t = mkScreen("activity-detail", perf.subject.anonId, [mkNode(fitness, "activity-headline", data)]);
  expectCode(validateTree(t, fitness, baseCtx({ data: {} })), "data-not-in-bundle");
});

test("strict: type-mismatched data fails even when the key is declared", () => {
  const t = mkScreen("activity-detail", perf.subject.anonId, [
    mkNode(fitness, "activity-headline", data),
    mkNode(fitness, "recovery-score-card", data),
  ]);
  const badData = { ...data, "readiness.score": "not a number" };
  expectCode(validateTree(t, fitness, baseCtx({ data: badData })), "data-type-mismatch");
});

test("strict: missing required data fails even if the binding is syntactically declared", () => {
  const t = mkScreen("activity-detail", perf.subject.anonId, [
    { type: "component", componentId: "activity-headline", variant: "standard", dataBindings: {} },
  ]);
  expectCode(validateTree(t, fitness, baseCtx()), "missing-required-data");
});

// --- prop semantics --------------------------------------------------------

const panelData: Record<string, JsonValue> = { title: "T", "media.url": "/m.mp4", "tile.value": 5, "tile.caption": "cap" };
const mkPanel = (children: UINode[], over: Partial<UITree> = {}) =>
  mkScreen("panel", perf.subject.anonId, [mkNode(a11yM, "title-card", panelData), ...children], over);
const panelCtx = (over: Partial<ValidateContext> = {}) => baseCtx({ surface: "panel", data: panelData, ...over });

test("strict: undeclared props are rejected (arbitrary props disallowed)", () => {
  const btn = mkNode(a11yM, "action-button", panelData, { props: { accessibilityLabel: "Go", surprise: 1 } });
  expectCode(validateTree(mkPanel([btn]), a11yM, panelCtx()), "prop-not-declared");
});

test("strict: prop type mismatch is rejected", () => {
  const btn = mkNode(a11yM, "action-button", panelData, { props: { accessibilityLabel: "Go", href: 123 } });
  expectCode(validateTree(mkPanel([btn]), a11yM, panelCtx()), "prop-type-mismatch");
});

test("strict: props with unsafe markup/executable content are rejected", () => {
  const btn = mkNode(a11yM, "action-button", panelData, { props: { accessibilityLabel: "Go", href: "javascript:alert(1)" } });
  expectCode(validateTree(mkPanel([btn]), a11yM, panelCtx()), "unsafe-prop-value");
});

// --- accessibility ---------------------------------------------------------

test("strict: interactive component without an accessibility label fails", () => {
  const btn = mkNode(a11yM, "action-button", panelData, { props: { href: "/x" } });
  expectCode(validateTree(mkPanel([btn]), a11yM, panelCtx()), "a11y-missing-label");
});

test("strict: with a label it passes", () => {
  const btn = mkNode(a11yM, "action-button", panelData, { props: { accessibilityLabel: "Open", href: "/x" } });
  assert.ok(validateTree(mkPanel([btn]), a11yM, panelCtx()).ok);
});

test("strict: non-reduced-motion-safe component fails when reduced motion is requested", () => {
  const rmProfile = clone(perf);
  rmProfile.context.device.reducedMotion = true;
  const t = mkPanel([mkNode(a11yM, "motion-banner", panelData)]);
  expectCode(validateTree(t, a11yM, panelCtx({ profile: rmProfile })), "a11y-reduced-motion");
  // Same component is fine when reduced motion is off.
  const okProfile = clone(perf);
  okProfile.context.device.reducedMotion = false;
  assert.ok(validateTree(t, a11yM, panelCtx({ profile: okProfile })).ok);
});

test("strict: component requiring a text fallback must bind a string data key", () => {
  const noText = mkScreen("panel", perf.subject.anonId, [
    mkNode(a11yM, "title-card", panelData),
    { type: "component", componentId: "text-tile", variant: "standard", dataBindings: { "tile.value": "tile.value" } },
  ]);
  expectCode(validateTree(noText, a11yM, panelCtx()), "a11y-missing-text-fallback");
  const withText = mkScreen("panel", perf.subject.anonId, [
    mkNode(a11yM, "title-card", panelData),
    { type: "component", componentId: "text-tile", variant: "standard", dataBindings: { "tile.value": "tile.value", "tile.caption": "tile.caption" } },
  ]);
  assert.ok(validateTree(withText, a11yM, panelCtx()).ok);
});

// --- layout & safety rails -------------------------------------------------

test("strict: max depth is enforced", () => {
  const m = clone(fitness);
  m.constraints.maxDepth = 1; // screen(0) -> section(1) -> component(2) violates
  expectCode(validateTree(flat, m, baseCtx()), "max-depth-exceeded");
});

test("strict: max component count is enforced", () => {
  const m = clone(fitness);
  m.constraints.maxComponents = 1;
  expectCode(validateTree(flat, m, baseCtx()), "max-components-exceeded");
});

test("strict: singleton duplicate policy is enforced", () => {
  const m = clone(fitness);
  m.constraints.singletons = ["insight-card"];
  const t = mkScreen("activity-detail", perf.subject.anonId, [
    mkNode(m, "activity-headline", data),
    mkNode(m, "insight-card", data),
    mkNode(m, "insight-card", data),
  ]);
  expectCode(validateTree(t, m, baseCtx()), "duplicate-component");
});

test("strict: a stable-anchor reorder fails relative to the previous tree", () => {
  const m = clone(fitness);
  m.constraints.pinned = []; // drop pinned so we can isolate anchor order
  const prev = mkScreen("activity-detail", perf.subject.anonId, [
    mkNode(m, "activity-headline", data),
    mkNode(m, "route-map-hero", data),
  ]);
  const reordered = mkScreen("activity-detail", perf.subject.anonId, [
    mkNode(m, "route-map-hero", data),
    mkNode(m, "activity-headline", data),
  ]);
  expectCode(validateTree(reordered, m, baseCtx({ previousTree: prev })), "stable-anchor-violation");
  // Same order as before is fine.
  assert.ok(validateTree(prev, m, baseCtx({ previousTree: prev })).ok);
});
