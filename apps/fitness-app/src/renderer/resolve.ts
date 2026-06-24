import type { JsonValue, UINode, UITree } from "../contract-types";

/**
 * Pure tree-walking + data-binding resolution. No React/RN imports, so it is unit
 * testable on its own. The renderer renders the output of `resolveScreen`.
 *
 * Slots are PRESERVED as nested children (not flattened into siblings): a
 * component's slot children resolve into `RenderItem.slots[slotId]`, so the
 * renderer can place them INSIDE the parent component — true composition.
 */
export interface RenderItem {
  key: string;
  componentId: string;
  variant?: string;
  props: Record<string, JsonValue>;
  reason?: string;
  /** Slot id -> resolved child items, rendered inside the parent's slot. */
  slots?: Record<string, RenderItem[]>;
  /** Slot ids whose children were structurally invalid (non-component nodes). */
  invalidSlots?: string[];
}

export interface RenderSection {
  label?: string;
  items: RenderItem[];
}

export function resolveBindings(
  bindings: Record<string, string> | undefined,
  data: Record<string, JsonValue>,
): Record<string, JsonValue> {
  const out: Record<string, JsonValue> = {};
  for (const [prop, key] of Object.entries(bindings ?? {})) {
    out[prop] = data[key] ?? null;
  }
  return out;
}

/** Resolve a single component node and its slots, recursively. */
function resolveComponent(
  node: UINode,
  data: Record<string, JsonValue>,
  nextKey: () => number,
): RenderItem {
  const item: RenderItem = {
    key: `${node.componentId}-${nextKey()}`,
    componentId: node.componentId!,
    variant: node.variant,
    props: resolveBindings(node.dataBindings, data),
    reason: node.reason,
  };

  const slotEntries = Object.entries(node.slots ?? {});
  if (slotEntries.length) {
    item.slots = {};
    const invalid: string[] = [];
    for (const [slotId, children] of slotEntries) {
      const valid = children.filter((c) => c.type === "component" && c.componentId);
      if (valid.length !== children.length) invalid.push(slotId);
      item.slots[slotId] = valid.map((c) => resolveComponent(c, data, nextKey));
    }
    if (invalid.length) item.invalidSlots = invalid;
  }
  return item;
}

export function resolveScreen(
  tree: UITree,
  data: Record<string, JsonValue>,
): RenderSection[] {
  let idx = 0;
  const nextKey = () => idx++;

  const topItems = (nodes: UINode[]): RenderItem[] =>
    nodes
      .filter((n) => n.type === "component" && n.componentId)
      .map((n) => resolveComponent(n, data, nextKey));

  const children = tree.root.children ?? [];
  const sections = children.filter((c) => c.type === "section");

  if (sections.length === 0) {
    return [{ items: topItems(children) }];
  }

  return sections.map((sec) => ({
    label: sec.label,
    items: topItems(sec.children ?? []),
  }));
}
