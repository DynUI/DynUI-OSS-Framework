import type { JsonValue } from "./json.js";
import type { SignalProfile } from "./signal-profile.js";
import type { ComponentManifest, GlobalConstraints } from "./component-manifest.js";
import type { UITree, ExperimentAssignment, ValidationError } from "./ui-tree.js";
/**
 * ModelProvider — the pluggable generation backend.
 *
 * Implementations wrap whatever model you configure (e.g. Anthropic, a local
 * model). The contract is identical across implementations, so swapping the
 * provider never touches the rest of the system.
 */
export interface ModelProvider {
    id: string;
    generate(req: GenerationRequest): Promise<GenerationResult>;
}
export interface GenerationRequest {
    surface: string;
    profile: SignalProfile;
    /**
     * The vocabulary the model may use. Usually pre-filtered to components whose
     * contract's `surfaces` and `audience` already match, to keep the prompt tight.
     */
    manifest: ComponentManifest;
    /** Hard rails the prompt is told about (and the validator re-checks after). */
    constraints: GlobalConstraints;
    /** Experiment assignments the generated tree must honor. */
    experiments: ExperimentAssignment[];
    /**
     * The resolved data available for this surface, keyed by the paths components'
     * `data` requirements reference (e.g. { "activity.hrZones": [...] }).
     */
    data: Record<string, JsonValue>;
    /** Optional generation controls. */
    options?: {
        temperature?: number;
        maxOutputTokens?: number;
        /** A previously cached tree to repair/refine instead of generating fresh. */
        seedTree?: UITree;
        /**
         * Validation errors from a prior attempt. When present, the provider is asked
         * to fix `seedTree` rather than generate from scratch (the repair pass).
         */
        repairErrors?: ValidationError[];
    };
}
export interface GenerationResult {
    tree: UITree;
    usage?: {
        inputTokens: number;
        outputTokens: number;
    };
    /** Provider-specific raw response, for debugging/telemetry. */
    raw?: unknown;
}
