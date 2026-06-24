import type { UITree } from "@dynui/contracts";

/** Extract a UITree from a model's text response, tolerating code fences/prose. */
export function parseTree(text: string): UITree {
  let s = text.trim();
  if (s.startsWith("```")) {
    s = s.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
  }
  const start = s.indexOf("{");
  const end = s.lastIndexOf("}");
  if (start === -1 || end === -1) {
    throw new Error("No JSON object found in model output");
  }
  return JSON.parse(s.slice(start, end + 1)) as UITree;
}
