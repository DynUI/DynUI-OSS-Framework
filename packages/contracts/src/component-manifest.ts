import type { JsonValue } from "./json.js";

/**
 * ComponentManifest — THE CONTRACT. This is the core IP of the framework.
 *
 * It is the versioned vocabulary the generation service is allowed to compose
 * from, plus each component's BEHAVIORAL CONTRACT: when it should appear, for whom,
 * with what intent, and the hard rails that keep generated screens safe.
 *
 * Division of labour (the design-process change this product sells):
 *   - DESIGNERS author the component, its variants/slots, and the `contract`
 *     (audience, intent, show/hide conditions, prominence) — in Figma, annotated.
 *   - DEVELOPERS implement the component normally (real code, real data sources)
 *     and declare its `data` requirements, then register it here.
 *
 * The manifest is exported from the design tool (Figma Dev Mode MCP for depth +
 * REST for breadth) into this canonical form; the design tool stays swappable.
 */
export interface ComponentManifest {
  schemaVersion: string; // "component-manifest/1.0"
  registry: {
    name: string;
    version: string; // semver of this manifest snapshot
    domain?: string; // e.g. "fitness" (the domain pack)
  };
  components: ComponentDef[];
  /** Global safety rails enforced AFTER the LLM, in code. */
  constraints: GlobalConstraints;
  /** Optional design tokens for theming; the renderer maps these to native styles. */
  tokens?: Record<string, JsonValue>;
  /** Tokens the renderer MUST support to render this manifest (renderer compat check). */
  requiredTokens?: string[];
}

export interface ComponentDef {
  id: string; // stable id the UI tree references, e.g. "recovery-score-card"
  name: string; // human label
  version: string; // semver of the component
  figmaNodeId?: string; // provenance link back to the design source
  category: string; // "metric" | "chart" | "table" | "social" | "hero" | "insight"

  /**
   * Description written for BOTH humans and the LLM. Be explicit about what the
   * component is and *when it is the right choice* — the model reads this to decide
   * whether to use it.
   */
  description: string;

  /** Intent tags — what user goal this serves. e.g. ["summarize-readiness","motivate"] */
  intent: string[];

  variants: VariantDef[]; // visual/density variants the model may pick
  slots: SlotDef[]; // named holes the model can fill with child components
  data: DataRequirement[]; // what data the component needs to render
  contract: BehavioralContract; // when/for-whom/how-prominent

  /**
   * Declared literal props the component accepts. The validator DISALLOWS
   * arbitrary props by default: a node may only set props named here (plus the
   * reserved `accessibilityLabel`). Omit or leave empty to forbid all props.
   */
  props?: PropDef[];

  /** Accessibility contract, enforced by the validator only where declared. */
  a11y?: AccessibilitySpec;

  /**
   * The behavior signal that engagement (taps) with this component feeds back into,
   * e.g. "fitness.engagement.charts.openRate". The telemetry aggregator uses this to
   * turn interactions into SignalProfile.behavior — closing the loop. Omit for
   * components whose engagement isn't a meaningful signal (e.g. the headline).
   */
  engagementSignal?: string;

  /**
   * Canary gate. If set, this component only becomes eligible for generation when
   * the user is assigned `enableForVariant` of experiment `id`. Without an
   * assignment it is never shown — so a new component can be validated on a slice
   * of a segment before it ships to everyone. Omit for always-eligible components.
   */
  experiment?: { id: string; enableForVariant: string };

  // --- registry governance ---------------------------------------------------
  /** Team/person responsible for this component. */
  owner?: string;
  /** Marked for removal — lint warns/fails per policy; prefer `replacedBy`. */
  deprecated?: boolean;
  /** The component id that supersedes this one (when deprecated). */
  replacedBy?: string;
  /** Minimum renderer version that can render this component. */
  minRendererVersion?: string;
}

export interface VariantDef {
  id: string; // "compact" | "expanded" | "data-rich"
  description: string; // when to prefer this variant
}

export interface SlotDef {
  id: string; // "primaryMetric" | "secondaryMetrics" | "footer"
  accepts: string[]; // allowed child categories or component ids; ["*"] = any
  required: boolean;
  description: string;
}

export interface DataRequirement {
  key: string; // path the renderer/binding uses, e.g. "activity.hrZones"
  type: DataType; // "number" | "string" | "series" | "geojson" | ...
  required: boolean;
  source?: string; // hint: where it comes from, e.g. "healthkit" | "api:activities"
}

/** Declared data/prop value types the validator type-checks bound values against. */
export type DataType =
  | "string"
  | "number"
  | "boolean"
  | "series" // array
  | "geojson" // object
  | "object"
  | "any";

export interface PropDef {
  name: string; // prop name a node may set
  type: DataType;
  required?: boolean; // must be present on every node using this component
}

export interface AccessibilitySpec {
  /** True for components a user can act on (tap/press); pairs with requiresLabel. */
  interactive?: boolean;
  /** If true, a node must set a non-empty `accessibilityLabel` prop. */
  requiresLabel?: boolean;
  /** If false, the component must not be placed when the user requests reduced motion. */
  reducedMotionSafe?: boolean;
  /** If true, the node must bind at least one declared string data key (text fallback). */
  requiresTextFallback?: boolean;
}

/**
 * The behavioral contract — the novel part. Drives selection, ranking, and
 * variant choice during generation.
 */
export interface BehavioralContract {
  /** Archetypes/cohorts this targets; ["*"] = everyone. */
  audience: string[];
  /** Which surfaces it may appear on, e.g. ["activity-detail","activity-log"]. */
  surfaces: string[];
  /** Soft conditions that FAVOR showing this component (weighted nudges). */
  showWhen?: SignalCondition[];
  /** Conditions that suppress it. */
  hideWhen?: SignalCondition[];
  /** Base ranking weight (higher = more likely to be placed prominently). */
  priority: number;
  /** Suggested placement strength; the generator may refine within constraints. */
  prominence?: "hero" | "primary" | "secondary" | "tertiary";
  /** Success metrics this component is meant to move (ties into experiments). */
  goals?: string[];
}

/**
 * A condition evaluated against a path into the SignalProfile.
 * `signal` is a dotted path, e.g. "archetype.primary" or
 * "behavior.fitness.engagement.charts.openRate".
 */
export interface SignalCondition {
  signal: string;
  op: "gt" | "gte" | "lt" | "lte" | "eq" | "neq" | "in" | "exists";
  value?: JsonValue;
  /** If set, a soft influence on ranking; if omitted, treated as a hard gate. */
  weight?: number;
}

/**
 * Hard rails. Enforced in code after generation. These are what make a
 * generative system safe and non-disorienting.
 */
export interface GlobalConstraints {
  /** Cap on modules rendered above the fold per surface. */
  maxModulesAboveFold?: number;
  /** Component ids that must always render (e.g. the core scoreline/metric). */
  neverHide?: string[];
  /** Components pinned to a fixed position regardless of personalization. */
  pinned?: { componentId: string; position: "top" | "bottom" }[];
  /** Components whose relative position must stay stable (anti-disorientation). */
  stableAnchors?: string[];
  /** Per-surface allow-list of component categories. */
  allowedCategoriesBySurface?: Record<string, string[]>;
  /** Max tree nesting depth (screen=0). Guards pathological model output. */
  maxDepth?: number;
  /** Max total component nodes in a tree. */
  maxComponents?: number;
  /** Component ids that must appear at most once (duplicate policy). */
  singletons?: string[];
}
