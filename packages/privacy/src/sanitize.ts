import type { UITree } from "@dynui/contracts";
import { redact } from "./redact.js";

/**
 * Prepare a previously-generated tree for inclusion in a REPAIR prompt.
 *
 * A repair prompt hands the model its prior (rejected) output to fix. That tree
 * may have had the authoritative `generatedFor.anonId` stamped onto it by the
 * orchestrator, and could in principle carry email-like strings or secrets in
 * free-text fields (e.g. a `reason`). None of that may reach a model provider.
 *
 * This helper returns a deep copy with:
 *  - `generatedFor.anonId` blanked to "" (the server re-stamps the real id later),
 *  - any email-like strings / API keys scrubbed from string fields,
 *  - any sensitive-keyed fields (userId/email/token/…) masked,
 * while preserving the structure (nodes, componentIds, variants, bindings, slots)
 * the model needs to actually repair the tree. The input is never mutated.
 */
export function sanitizeTreeForPrompt(tree: UITree): UITree {
  const clone = structuredClone(tree);
  if (clone.generatedFor) clone.generatedFor.anonId = "";
  // Deep redaction scrubs emails/keys from strings and masks sensitive keys, but
  // leaves structural fields (type/componentId/variant/dataBindings/slots) intact.
  return redact(clone) as UITree;
}
