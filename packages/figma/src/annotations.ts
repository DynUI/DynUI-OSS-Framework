import type { DynuiAnnotation } from "./types.js";

const BLOCK = /```dynui\s*([\s\S]*?)```/i;

/** Parse the ```dynui JSON block from a Figma description (or {} if absent). */
export function parseAnnotation(description: string | undefined): DynuiAnnotation {
  if (!description) return {};
  const m = description.match(BLOCK);
  if (!m) return {};
  try {
    return JSON.parse(m[1].trim()) as DynuiAnnotation;
  } catch (e) {
    throw new Error(`Invalid \`dynui\` annotation block: ${e instanceof Error ? e.message : e}`);
  }
}

/** The human-readable part of the description, with the annotation block removed. */
export function stripAnnotation(description: string | undefined): string {
  return (description ?? "").replace(BLOCK, "").trim();
}

export function toKebab(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
