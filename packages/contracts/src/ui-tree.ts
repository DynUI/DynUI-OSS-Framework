import type { JsonValue } from "./json.js";

/**
 * UITree — the SERVER-DRIVEN-UI contract.
 *
 * This is what the LLM emits and the native (RN/Expo) renderer consumes. The model
 * never produces markup or styles — only a tree of references to components that
 * already exist in the ComponentManifest. That bound vocabulary is what makes L4
 * generation safe: every tree is validated against the manifest + global
 * constraints before it is allowed to render, with a deterministic fallback if it
 * fails.
 */
export interface UITree {
  schemaVersion: string; // "ui-tree/1.0"
  surface: string; // must match the requested surface
  generatedFor: {
    anonId: string;
    archetype?: string;
  };
  meta: GenerationMeta;
  root: UINode; // typically a "screen" node
}

export interface GenerationMeta {
  generatedAt: string; // ISO 8601
  model: string; // provider/model id that produced this (or "fallback")
  cacheKey: string; // (surface × segment × context) key for caching/promotion
  /** Experiment assignments honored while generating, for attribution. */
  experiments?: ExperimentAssignment[];
  /** True if this is the deterministic fallback layout (generation/validation failed). */
  fallback: boolean;
}

export interface ExperimentAssignment {
  experimentId: string;
  variant: string;
}

/**
 * A node in the tree. Three shapes:
 *  - "screen"  : the surface root; holds ordered children.
 *  - "section" : a logical grouping (e.g. "above-the-fold"); holds children.
 *  - "component": a reference to a manifest component to render.
 */
export interface UINode {
  type: "screen" | "section" | "component";

  // component nodes -----------------------------------------------------------
  /** Required for type "component"; must be a ComponentDef.id in the manifest. */
  componentId?: string;
  /** Must be one of the component's declared VariantDef.id values. */
  variant?: string;
  /** Slot id -> child nodes. Slot ids and accepted categories are manifest-checked. */
  slots?: Record<string, UINode[]>;
  /** Literal props passed to the component. */
  props?: Record<string, JsonValue>;
  /**
   * Maps a prop/slot to a path in the resolved data bundle, e.g.
   * { "series": "activity.hrZones" }. Validated against the component's `data`.
   */
  dataBindings?: Record<string, string>;

  // screen / section nodes ----------------------------------------------------
  /** Ordered children for "screen" / "section" nodes. */
  children?: UINode[];
  /** Optional section label (for "section" nodes). */
  label?: string;

  // explainability ------------------------------------------------------------
  /** Short human rationale for including this node ("why did I see this?"). */
  reason?: string;
  /** Structured, machine-readable explanation (the deterministic engine emits this). */
  explanation?: NodeExplanation;
}

/**
 * Structured "why is this here" for a component node. The deterministic engine
 * produces one per component; it distinguishes the four kinds of reason the
 * Phase 3 contract requires: hard eligibility, ranking nudges, layout/safety
 * constraints, and fallback/neutral reasons.
 */
export interface NodeExplanation {
  /** Hard eligibility gates this component passed (surface/audience/data/showWhen). */
  eligibility: string[];
  /** Ranking nudges that adjusted the score, with their score delta. */
  nudges: { signal: string; delta: number }[];
  /** The component's base priority before nudges. */
  basePriority: number;
  /** Final ranking score. */
  score: number;
  /** Layout/safety constraints that affected placement (pinned/neverHide/above-fold). */
  constraints?: string[];
  /** Present when the component is here for a fallback/neutral reason, not a match. */
  fallbackReason?: string;
}

/**
 * Result of validating a UITree against a manifest. The generation service rejects
 * (and repairs or falls back) on any error before the tree reaches a device.
 */
export interface ValidationResult {
  ok: boolean;
  errors: ValidationError[];
}

export type ValidationCode =
  // --- structural (manifest-only) ---
  | "unknown-component"
  | "unknown-variant"
  | "unknown-slot"
  | "slot-category-mismatch"
  | "missing-required-slot"
  | "missing-required-data"
  | "unknown-data-binding"
  | "constraint-violation" // neverHide / maxModulesAboveFold / pinned / category allow-list / experiment gate
  // --- root & metadata invariants ---
  | "root-not-screen"
  | "mixed-root-children"
  | "surface-mismatch"
  | "subject-mismatch"
  | "experiments-mismatch"
  | "fallback-flag-mismatch"
  // --- component contract eligibility (require request context) ---
  | "surface-ineligible"
  | "audience-ineligible"
  | "show-when-failed"
  | "hide-when-violated"
  | "consent-violation"
  // --- data semantics ---
  | "data-not-in-bundle"
  | "data-type-mismatch"
  // --- prop semantics ---
  | "prop-not-declared"
  | "prop-type-mismatch"
  | "unsafe-prop-value"
  // --- layout & safety rails ---
  | "max-depth-exceeded"
  | "max-components-exceeded"
  | "duplicate-component"
  | "stable-anchor-violation"
  // --- accessibility (where declared) ---
  | "a11y-missing-label"
  | "a11y-reduced-motion"
  | "a11y-missing-text-fallback";

export interface ValidationError {
  code: ValidationCode;
  nodePath: string; // JSON pointer to the offending node
  message: string;
}
