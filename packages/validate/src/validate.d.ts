import type { ComponentManifest, UITree, ValidationResult } from "@dynui/contracts";
/**
 * Validate a generated UITree against the manifest + global constraints.
 *
 * This is the safety boundary that makes bounded generation (L4) shippable: the
 * model may emit anything, but only trees that pass here are allowed to render.
 * Anything else is repaired or replaced with the deterministic fallback upstream.
 */
export declare function validateTree(tree: UITree, manifest: ComponentManifest): ValidationResult;
