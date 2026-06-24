/**
 * @dynui/contracts — the canonical contracts the whole framework compiles against.
 *
 * Four contracts, one seam each:
 *   - SignalProfile      : who the user is (Profile Adapter output)
 *   - ComponentManifest  : what may be composed + behavioral contracts (the IP)
 *   - UITree             : what the model emits / the renderer consumes (SDUI)
 *   - ModelProvider      : how a screen gets generated (pluggable backend)
 */
export type { JsonValue, JsonPrimitive } from "./json.js";
export type { SignalProfile } from "./signal-profile.js";
export type { ProfileAdapter, ResolveContext } from "./profile-adapter.js";
export type { ComponentManifest, ComponentDef, VariantDef, SlotDef, DataRequirement, BehavioralContract, SignalCondition, GlobalConstraints, } from "./component-manifest.js";
export type { UITree, UINode, GenerationMeta, ExperimentAssignment, ValidationResult, ValidationError, } from "./ui-tree.js";
export type { ModelProvider, GenerationRequest, GenerationResult, } from "./model-provider.js";
