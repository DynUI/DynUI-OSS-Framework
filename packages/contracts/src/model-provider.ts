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
  id: string; // e.g. "anthropic:claude-opus-4-8" | "local:my-model"
  /**
   * Generate a tree. `opts.signal` lets the orchestrator cancel a slow call once
   * its latency budget is exceeded; providers should pass it to their transport.
   */
  generate(req: GenerationRequest, opts?: { signal?: AbortSignal }): Promise<GenerationResult>;
}

export interface GenerationRequest {
  surface: string; // which screen to compose
  profile: SignalProfile; // who we're composing for
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
    /**
     * Safe placeholder values for required data keys, used ONLY by the
     * deterministic fallback. If the model path fails and a `neverHide` component
     * needs data missing from `data`, the fallback fills it from here so the
     * returned tree stays renderable. Real `data` always wins over a fallback value.
     */
    fallbackData?: Record<string, JsonValue>;
  };
}

export interface GenerationResult {
  tree: UITree; // NOT yet validated — the orchestrator validates + applies fallback
  usage?: {
    inputTokens: number;
    outputTokens: number;
  };
  /** Provider-specific raw response, for debugging/telemetry. */
  raw?: unknown;
}
