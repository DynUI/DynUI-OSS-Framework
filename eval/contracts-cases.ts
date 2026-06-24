/**
 * Declarative expectations for every contract fixture — the Phase 0 "thresholds in
 * code, not prose" requirement. CI fails if any fixture's outcome regresses from
 * what is declared here.
 */
import type { ExperimentAssignment, ValidationError } from "@dynui/contracts";

/** How to build the ValidateContext for a case (omitted = manifest-only check). */
export interface CaseCtx {
  profile?: string; // fixture filename (no dir) under profiles/valid
  surface?: string;
  data?: "fitness" | "slots";
  experiments?: ExperimentAssignment[];
}

export interface TreeCase {
  file: string; // path under tests/fixtures/trees/
  manifest: "fitness" | "slots";
  ctx?: CaseCtx;
  expect:
    | { ok: true }
    | { ok: false; code: ValidationError["code"]; messageMatch?: string };
}

/**
 * Valid trees — must pass the FULL (context-aware) validator with zero errors.
 * Each carries the request context it was composed for, proving the strict
 * safety boundary accepts on-contract screens.
 */
export const validTreeCases: TreeCase[] = [
  { file: "valid/flat-performance.json", manifest: "fitness", ctx: { profile: "performance", surface: "activity-detail", data: "fitness" }, expect: { ok: true } },
  { file: "valid/experiment-gated.json", manifest: "fitness", ctx: { profile: "performance", surface: "activity-detail", data: "fitness", experiments: [{ experimentId: "exp.strength-volume", variant: "treatment" }] }, expect: { ok: true } },
  { file: "valid/no-consent-neutral.json", manifest: "fitness", ctx: { profile: "no-consent", surface: "activity-detail", data: "fitness" }, expect: { ok: true } },
  { file: "valid/nested-slots.json", manifest: "slots", ctx: { profile: "performance", surface: "dashboard", data: "slots" }, expect: { ok: true } },
];

/**
 * Invalid trees — one per validator rule. Each must fail with the declared error
 * code; constraint sub-rules are additionally pinned by a message substring so the
 * rules cannot collapse into one another undetected.
 */
export const invalidTreeCases: TreeCase[] = [
  { file: "invalid/unknown-component.json", manifest: "fitness", expect: { ok: false, code: "unknown-component" } },
  { file: "invalid/unknown-variant.json", manifest: "fitness", expect: { ok: false, code: "unknown-variant" } },
  { file: "invalid/missing-required-data.json", manifest: "fitness", expect: { ok: false, code: "missing-required-data" } },
  { file: "invalid/unknown-data-binding.json", manifest: "fitness", expect: { ok: false, code: "unknown-data-binding" } },
  { file: "invalid/unknown-slot.json", manifest: "slots", expect: { ok: false, code: "unknown-slot" } },
  { file: "invalid/slot-category-mismatch.json", manifest: "slots", expect: { ok: false, code: "slot-category-mismatch" } },
  { file: "invalid/missing-required-slot.json", manifest: "slots", expect: { ok: false, code: "missing-required-slot" } },
  { file: "invalid/constraint-neverhide.json", manifest: "fitness", expect: { ok: false, code: "constraint-violation", messageMatch: "neverHide" } },
  { file: "invalid/constraint-max-above-fold.json", manifest: "fitness", expect: { ok: false, code: "constraint-violation", messageMatch: "Above-the-fold" } },
  { file: "invalid/constraint-pinned-top.json", manifest: "fitness", expect: { ok: false, code: "constraint-violation", messageMatch: "pinned top" } },
  { file: "invalid/constraint-category-not-allowed.json", manifest: "fitness", expect: { ok: false, code: "constraint-violation", messageMatch: "not allowed" } },
  { file: "invalid/experiment-leak.json", manifest: "fitness", expect: { ok: false, code: "constraint-violation", messageMatch: "gated" } },
  { file: "invalid/mixed-root-children.json", manifest: "fitness", expect: { ok: false, code: "mixed-root-children" } },
  // Context-dependent rules (validated WITH a request context).
  { file: "invalid/wrong-surface.json", manifest: "fitness", ctx: { profile: "performance", surface: "activity-detail", data: "fitness" }, expect: { ok: false, code: "surface-mismatch" } },
  { file: "invalid/no-consent-archetype-leak.json", manifest: "fitness", ctx: { profile: "no-consent", surface: "activity-detail", data: "fitness" }, expect: { ok: false, code: "consent-violation" } },
];

export interface StructuralCase {
  file: string;
  valid: boolean; // true => expect no structural issues; false => expect >=1
}

export const manifestCases: StructuralCase[] = [
  { file: "manifests/valid/slots.json", valid: true },
  { file: "manifests/valid/a11y-props.json", valid: true },
  { file: "manifests/invalid/duplicate-component-ids.json", valid: false },
  { file: "manifests/invalid/constraint-ref-missing-component.json", valid: false },
];

export const profileCases: StructuralCase[] = [
  { file: "profiles/valid/performance.json", valid: true },
  { file: "profiles/valid/wellness.json", valid: true },
  { file: "profiles/valid/social.json", valid: true },
  { file: "profiles/valid/cold-start.json", valid: true },
  { file: "profiles/valid/no-consent.json", valid: true },
  { file: "profiles/invalid/missing-consent.json", valid: false },
  { file: "profiles/invalid/bad-archetype-confidence.json", valid: false },
];
