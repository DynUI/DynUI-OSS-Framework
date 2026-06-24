import { parseAnnotation, toKebab } from "./annotations.js";
import type { FigmaFile } from "./types.js";

export interface FigmaIssue {
  code: "bad-annotation" | "missing-field" | "duplicate-id" | "unnamed";
  severity: "error" | "warning";
  nodeId: string;
  nodeName: string;
  message: string;
}

/**
 * Validate the dynui annotations in a Figma file BEFORE mapping to a manifest.
 * Reports the exact node for each problem: an unparseable annotation block, a
 * missing required field, or two nodes that generate the same component id.
 */
export function validateFigmaFile(file: FigmaFile): FigmaIssue[] {
  const issues: FigmaIssue[] = [];
  const entries: { nodeId: string; name: string; description?: string }[] = [
    ...Object.entries(file.components ?? {}).map(([nodeId, m]) => ({ nodeId, name: m.name, description: m.description })),
    ...Object.entries(file.componentSets ?? {}).map(([nodeId, m]) => ({ nodeId, name: m.name, description: m.description })),
  ];

  const seen = new Map<string, string>(); // generated id -> first node id
  for (const e of entries) {
    let annotation;
    try {
      annotation = parseAnnotation(e.description);
    } catch (err) {
      issues.push({
        code: "bad-annotation",
        severity: "error",
        nodeId: e.nodeId,
        nodeName: e.name,
        message: `Unparseable dynui annotation: ${err instanceof Error ? err.message : String(err)}`,
      });
      continue;
    }

    const genId = annotation.id ?? toKebab(e.name);
    if (!genId) {
      issues.push({ code: "unnamed", severity: "error", nodeId: e.nodeId, nodeName: e.name, message: "Cannot derive a component id from the node name." });
      continue;
    }
    if (seen.has(genId)) {
      issues.push({ code: "duplicate-id", severity: "error", nodeId: e.nodeId, nodeName: e.name, message: `Generated id '${genId}' collides with node ${seen.get(genId)}.` });
    } else {
      seen.set(genId, e.nodeId);
    }

    if (!annotation.category) {
      issues.push({ code: "missing-field", severity: "warning", nodeId: e.nodeId, nodeName: e.name, message: "Annotation is missing 'category' (a default will be applied)." });
    }
  }

  return issues;
}

export const figmaValidationPassed = (issues: FigmaIssue[]): boolean =>
  !issues.some((i) => i.severity === "error");
