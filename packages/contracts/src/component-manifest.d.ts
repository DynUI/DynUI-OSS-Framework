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
    schemaVersion: string;
    registry: {
        name: string;
        version: string;
        domain?: string;
    };
    components: ComponentDef[];
    /** Global safety rails enforced AFTER the LLM, in code. */
    constraints: GlobalConstraints;
    /** Optional design tokens for theming; the renderer maps these to native styles. */
    tokens?: Record<string, JsonValue>;
}
export interface ComponentDef {
    id: string;
    name: string;
    version: string;
    figmaNodeId?: string;
    category: string;
    /**
     * Description written for BOTH humans and the LLM. Be explicit about what the
     * component is and *when it is the right choice* — the model reads this to decide
     * whether to use it.
     */
    description: string;
    /** Intent tags — what user goal this serves. e.g. ["summarize-readiness","motivate"] */
    intent: string[];
    variants: VariantDef[];
    slots: SlotDef[];
    data: DataRequirement[];
    contract: BehavioralContract;
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
    experiment?: {
        id: string;
        enableForVariant: string;
    };
}
export interface VariantDef {
    id: string;
    description: string;
}
export interface SlotDef {
    id: string;
    accepts: string[];
    required: boolean;
    description: string;
}
export interface DataRequirement {
    key: string;
    type: string;
    required: boolean;
    source?: string;
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
    pinned?: {
        componentId: string;
        position: "top" | "bottom";
    }[];
    /** Components whose relative position must stay stable (anti-disorientation). */
    stableAnchors?: string[];
    /** Per-surface allow-list of component categories. */
    allowedCategoriesBySurface?: Record<string, string[]>;
}
