import test from "node:test";
import assert from "node:assert/strict";
import type { UINode } from "@dynui/contracts";
import { validateTree } from "@dynui/validate";
import { composeHeuristic } from "@dynui/generate";
import { manifest, profiles, req } from "./helpers";

function firstComponent(node: UINode): UINode | undefined {
  if (node.type === "component") return node;
  for (const c of node.children ?? []) {
    const f = firstComponent(c);
    if (f) return f;
  }
  return undefined;
}

test("a heuristic-composed tree passes validation", () => {
  const tree = composeHeuristic(req(profiles.performanceAthlete));
  assert.ok(validateTree(tree, manifest).ok);
});

test("unknown component id is rejected", () => {
  const tree = composeHeuristic(req(profiles.performanceAthlete));
  firstComponent(tree.root)!.componentId = "does-not-exist";
  const r = validateTree(tree, manifest);
  assert.ok(!r.ok);
  assert.ok(r.errors.some((e) => e.code === "unknown-component"));
});

test("missing a neverHide component is rejected", () => {
  const tree = composeHeuristic(req(profiles.performanceAthlete));
  // Drop the pinned headline everywhere.
  for (const section of tree.root.children ?? []) {
    section.children = (section.children ?? []).filter(
      (c) => c.componentId !== "activity-headline",
    );
  }
  assert.ok(!validateTree(tree, manifest).ok);
});

test("experiment-gated component: valid WITH assignment, rejected WITHOUT (canary leak)", () => {
  const tree = composeHeuristic(
    req(profiles.performanceAthlete, [{ experimentId: "exp.strength-volume", variant: "treatment" }]),
  );
  assert.ok(componentIdsHas(tree.root, "strength-volume-card"));
  assert.ok(validateTree(tree, manifest).ok, "valid while the assignment is present");

  tree.meta.experiments = []; // strip the assignment but keep the component
  const r = validateTree(tree, manifest);
  assert.ok(!r.ok, "must reject a gated component with no enabling assignment");
  assert.ok(r.errors.some((e) => e.code === "constraint-violation"));
});

function componentIdsHas(node: UINode, id: string): boolean {
  if (node.componentId === id) return true;
  return (
    (node.children ?? []).some((c) => componentIdsHas(c, id)) ||
    Object.values(node.slots ?? {}).flat().some((c) => componentIdsHas(c, id))
  );
}
