import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { JsonValue, UINode, UITree } from "../apps/fitness-app/src/contract-types";
import { resolveScreen } from "../apps/fitness-app/src/renderer/resolve";
import {
  checkRendererCompat,
  rendererSpecs,
  type RendererSpec,
} from "../apps/fitness-app/src/renderer/registry-contract";
import { buildScenarios } from "../scripts/visual/scenarios";

const root = join(import.meta.dirname, "..");
const rj = (p: string) => JSON.parse(readFileSync(join(root, p), "utf8"));
const fitness = rj("examples/fitness/manifest.example.json");
const slotsManifest = rj("tests/fixtures/manifests/valid/slots.json");
const clone = <T>(x: T): T => structuredClone(x);

const data: Record<string, JsonValue> = { title: "T", value: 5, series: [1, 2, 3] };

function nestedTree(bodyChild = "mini-metric"): UITree {
  return {
    schemaVersion: "ui-tree/1.0",
    surface: "dashboard",
    generatedFor: { anonId: "u" },
    meta: { generatedAt: "t", model: "m", cacheKey: "k", fallback: false },
    root: {
      type: "screen",
      children: [
        {
          type: "component",
          componentId: "dashboard-panel",
          variant: "standard",
          slots: {
            body: [{ type: "component", componentId: bodyChild, variant: "compact", dataBindings: { value: "value" } }],
            footer: [{ type: "component", componentId: "mini-chart", variant: "sparkline", dataBindings: { series: "series" } }],
          },
        },
      ],
    },
  };
}

// --- nested rendering ------------------------------------------------------

test("slot children are preserved as nested items, NOT flattened into siblings", () => {
  const sections = resolveScreen(nestedTree(), data);
  assert.equal(sections.length, 1);
  assert.equal(sections[0].items.length, 1, "only the parent is a top-level item");
  const panel = sections[0].items[0];
  assert.equal(panel.componentId, "dashboard-panel");
  assert.ok(panel.slots, "parent carries resolved slots");
  assert.equal(panel.slots!.body[0].componentId, "mini-metric");
  assert.equal(panel.slots!.footer[0].componentId, "mini-chart");
  // The children must NOT appear as top-level siblings (the old flattening bug).
  const topIds = sections[0].items.map((i) => i.componentId);
  assert.ok(!topIds.includes("mini-metric"));
  assert.ok(!topIds.includes("mini-chart"));
});

test("nested slot child data bindings resolve against the bundle", () => {
  const panel = resolveScreen(nestedTree(), data)[0].items[0];
  assert.equal(panel.slots!.body[0].props["value"], 5);
  assert.deepEqual(panel.slots!.footer[0].props["series"], [1, 2, 3]);
});

test("structurally invalid slot children are flagged for safe-fallback rendering", () => {
  const t = nestedTree();
  t.root.children![0].slots!.body = [{ type: "section", children: [] }];
  const panel = resolveScreen(t, data)[0].items[0];
  assert.ok(panel.invalidSlots?.includes("body"));
});

// --- root-shape resolution (Phase 4) ---------------------------------------

const componentNode = (id: string): UINode =>
  ({ type: "component", componentId: id, variant: "standard", dataBindings: {} });

test("an all-section screen resolves every section's items in order", () => {
  const tree: UITree = {
    schemaVersion: "ui-tree/1.0",
    surface: "dashboard",
    generatedFor: { anonId: "u" },
    meta: { generatedAt: "t", model: "m", cacheKey: "k", fallback: false },
    root: {
      type: "screen",
      children: [
        { type: "section", label: "above-the-fold", children: [componentNode("a"), componentNode("b")] },
        { type: "section", label: "details", children: [componentNode("c")] },
      ],
    },
  };
  const sections = resolveScreen(tree, data);
  assert.equal(sections.length, 2);
  assert.deepEqual(sections.map((s) => s.label), ["above-the-fold", "details"]);
  assert.deepEqual(sections[0].items.map((i) => i.componentId), ["a", "b"]);
  assert.deepEqual(sections[1].items.map((i) => i.componentId), ["c"]);
});

test("an all-component (unsectioned) screen resolves all components, none dropped", () => {
  const tree: UITree = {
    schemaVersion: "ui-tree/1.0",
    surface: "dashboard",
    generatedFor: { anonId: "u" },
    meta: { generatedAt: "t", model: "m", cacheKey: "k", fallback: false },
    root: { type: "screen", children: [componentNode("a"), componentNode("b"), componentNode("c")] },
  };
  const sections = resolveScreen(tree, data);
  assert.equal(sections.length, 1, "one implicit section");
  assert.deepEqual(sections[0].items.map((i) => i.componentId), ["a", "b", "c"], "no component is dropped");
});

// --- visual scenario generation (Phase 7, browser-free guard) --------------

test("visual scenarios resolve: valid fixtures use only known components; the negative one trips the fallback", () => {
  const scenarios = buildScenarios();
  assert.equal(scenarios.length, 6, "all required visual scenarios present");
  const ids = (s: { sections: { items: { componentId: string; slots?: Record<string, { componentId: string }[]> }[] }[] }) => {
    const out: string[] = [];
    for (const sec of s.sections)
      for (const it of sec.items) {
        out.push(it.componentId);
        for (const kids of Object.values(it.slots ?? {})) for (const k of kids) out.push(k.componentId);
      }
    return out;
  };
  for (const s of scenarios) {
    const unknown = ids(s).filter((id) => !s.knownIds.includes(id));
    if (s.expectUnregistered) {
      assert.ok(unknown.includes(s.expectUnregistered), `${s.id}: negative scenario must include an unregistered component`);
    } else {
      assert.deepEqual(unknown, [], `${s.id}: every valid component must be renderable (known)`);
      assert.ok(ids(s).length > 0, `${s.id}: must resolve at least one item`);
    }
  }
});

// --- renderer compatibility ------------------------------------------------

test("the fitness manifest is fully renderer-compatible", () => {
  assert.deepEqual(checkRendererCompat(fitness, rendererSpecs), []);
});

test("compat fails when a manifest component has no renderer", () => {
  const specs = rendererSpecs.filter((s) => s.componentId !== "insight-card");
  const issues = checkRendererCompat(fitness, specs);
  assert.ok(issues.some((i) => i.code === "missing-renderer" && i.componentId === "insight-card"));
});

test("compat fails when a declared variant is unsupported", () => {
  const specs = rendererSpecs.map((s) =>
    s.componentId === "activity-headline" ? { ...s, variants: ["standard"] } : s,
  );
  const issues = checkRendererCompat(fitness, specs);
  assert.ok(issues.some((i) => i.code === "unsupported-variant" && i.componentId === "activity-headline"));
});

test("compat fails when a required slot is unsupported", () => {
  // slots manifest: dashboard-panel has a required `body` slot.
  const specs: RendererSpec[] = [
    { componentId: "panel-title", variants: ["*"], slots: [], data: ["*"] },
    { componentId: "dashboard-panel", variants: ["*"], slots: [], data: ["*"] }, // no slot support
    { componentId: "mini-metric", variants: ["*"], slots: [], data: ["*"] },
    { componentId: "mini-chart", variants: ["*"], slots: [], data: ["*"] },
  ];
  const issues = checkRendererCompat(slotsManifest, specs);
  assert.ok(issues.some((i) => i.code === "unsupported-slot" && i.componentId === "dashboard-panel"));
});

test("compat fails on a mismatched component version range", () => {
  const specs = rendererSpecs.map((s) =>
    s.componentId === "activity-headline" ? { ...s, componentVersionRange: "9.x" } : s,
  );
  const issues = checkRendererCompat(fitness, specs);
  assert.ok(issues.some((i) => i.code === "version-mismatch" && i.componentId === "activity-headline"));
});

test("compat fails when a renderer ignores a required data key it didn't opt out of", () => {
  const specs = rendererSpecs.map((s) =>
    s.componentId === "activity-headline" ? { ...s, data: ["activity.title"] } : s,
  );
  const issues = checkRendererCompat(fitness, specs);
  assert.ok(issues.some((i) => i.code === "missing-data-consumer" && i.componentId === "activity-headline"));
});
