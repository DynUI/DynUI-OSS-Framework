/**
 * Fixture loading + lightweight structural checks for the Phase 0 eval harness.
 *
 * Phase 0 establishes the measurement harness BEFORE behavior changes. The
 * structural checks here are intentionally minimal — full runtime schema
 * validation arrives in Phase 1 and will plug into these same fixtures.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { ComponentManifest } from "@dynui/contracts";
import { parseComponentManifest, parseSignalProfile } from "@dynui/contracts";

export const ROOT = join(import.meta.dirname, "..");
export const FIX = join(ROOT, "tests/fixtures");

export const readJson = (abs: string): unknown =>
  JSON.parse(readFileSync(abs, "utf8"));

export const listJson = (dir: string): string[] =>
  readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .sort();

/** Named manifests the tree cases validate against. */
export const manifests: Record<string, ComponentManifest> = {
  fitness: readJson(join(ROOT, "examples/fitness/manifest.example.json")) as ComponentManifest,
  slots: readJson(join(FIX, "manifests/valid/slots.json")) as ComponentManifest,
};

/** Resolved data bundles keyed by manifest name (for generation evals). */
export const dataBundles: Record<string, Record<string, unknown>> = {
  fitness: readJson(join(ROOT, "examples/fitness/sample-activity.json")) as Record<string, unknown>,
  slots: readJson(join(FIX, "data/dashboard.json")) as Record<string, unknown>,
};

export interface StructuralIssue {
  code: string;
  message: string;
}

/**
 * Manifest/profile checks now delegate to the real Phase 1 runtime schemas in
 * `@dynui/contracts`, so the fixture corpus is measured against the same code that
 * guards every public JSON entry point.
 */
export function checkManifest(input: unknown): StructuralIssue[] {
  const r = parseComponentManifest(input);
  return r.ok ? [] : r.issues.map((i) => ({ code: i.code, message: `${i.path}: ${i.message}` }));
}

export function checkProfile(input: unknown): StructuralIssue[] {
  const r = parseSignalProfile(input);
  return r.ok ? [] : r.issues.map((i) => ({ code: i.code, message: `${i.path}: ${i.message}` }));
}
