import type { UINode, UITree } from "@dynui/contracts";

/**
 * Defensive normalization of raw model output BEFORE validation:
 *  - strips unknown node fields (the model can't smuggle arbitrary keys through),
 *  - rejects unknown node types,
 *  - rejects oversized trees (too many nodes / too deep).
 *
 * Stripping is non-fatal; unknown-type and oversize are fatal (unrepairable) so the
 * orchestrator drops straight to the deterministic fallback.
 */
export interface NormalizeLimits {
  maxComponents?: number;
  maxDepth?: number;
}

export interface NormalizeResult {
  ok: boolean;
  tree: UITree;
  issues: string[];
}

const KNOWN_NODE_KEYS = new Set([
  "type",
  "componentId",
  "variant",
  "slots",
  "props",
  "dataBindings",
  "children",
  "label",
  "reason",
  "explanation",
]);
const KNOWN_TYPES = new Set(["screen", "section", "component"]);

export function normalizeTree(raw: UITree, limits: NormalizeLimits = {}): NormalizeResult {
  const issues: string[] = [];
  let componentCount = 0;
  let maxDepth = 0;

  const cleanNode = (node: UINode, depth: number): UINode => {
    maxDepth = Math.max(maxDepth, depth);
    if (!node || typeof node !== "object" || !KNOWN_TYPES.has(node.type)) {
      issues.push(`unknown node type '${(node as { type?: string })?.type}'`);
      return { type: "section", children: [] };
    }
    if (node.type === "component") componentCount++;

    const cleaned: UINode = { type: node.type };
    for (const key of Object.keys(node)) {
      if (!KNOWN_NODE_KEYS.has(key)) {
        issues.push(`stripped unknown field '${key}' on ${node.type} node`);
      }
    }
    if (node.componentId != null) cleaned.componentId = node.componentId;
    if (node.variant != null) cleaned.variant = node.variant;
    if (node.props != null) cleaned.props = node.props;
    if (node.dataBindings != null) cleaned.dataBindings = node.dataBindings;
    if (node.label != null) cleaned.label = node.label;
    if (node.reason != null) cleaned.reason = node.reason;
    if (node.explanation != null) cleaned.explanation = node.explanation;
    if (node.children) cleaned.children = node.children.map((c) => cleanNode(c, depth + 1));
    if (node.slots) {
      cleaned.slots = Object.fromEntries(
        Object.entries(node.slots).map(([k, kids]) => [k, kids.map((c) => cleanNode(c, depth + 1))]),
      );
    }
    return cleaned;
  };

  const root = cleanNode(raw.root, 0);
  const tree: UITree = { ...raw, root };

  // Fatal limits.
  const hardFail = issues.some((i) => i.startsWith("unknown node type"));
  if (limits.maxComponents != null && componentCount > limits.maxComponents) {
    issues.push(`oversized: ${componentCount} components > max ${limits.maxComponents}`);
  }
  if (limits.maxDepth != null && maxDepth > limits.maxDepth) {
    issues.push(`too deep: depth ${maxDepth} > max ${limits.maxDepth}`);
  }
  const oversized = issues.some((i) => i.startsWith("oversized") || i.startsWith("too deep"));

  return { ok: !hardFail && !oversized, tree, issues };
}
