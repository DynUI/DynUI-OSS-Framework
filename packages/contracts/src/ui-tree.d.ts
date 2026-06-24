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
    schemaVersion: string;
    surface: string;
    generatedFor: {
        anonId: string;
        archetype?: string;
    };
    meta: GenerationMeta;
    root: UINode;
}
export interface GenerationMeta {
    generatedAt: string;
    model: string;
    cacheKey: string;
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
    /** Ordered children for "screen" / "section" nodes. */
    children?: UINode[];
    /** Optional section label (for "section" nodes). */
    label?: string;
    /** The model's short rationale for including this node ("why did I see this?"). */
    reason?: string;
}
/**
 * Result of validating a UITree against a manifest. The generation service rejects
 * (and repairs or falls back) on any error before the tree reaches a device.
 */
export interface ValidationResult {
    ok: boolean;
    errors: ValidationError[];
}
export interface ValidationError {
    code: "unknown-component" | "unknown-variant" | "unknown-slot" | "slot-category-mismatch" | "missing-required-slot" | "missing-required-data" | "unknown-data-binding" | "constraint-violation";
    nodePath: string;
    message: string;
}
