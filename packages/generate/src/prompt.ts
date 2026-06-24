import type { ComponentDef, GenerationRequest } from "@dynui/contracts";
import { minimizeProfileForPrompt, sanitizeTreeForPrompt } from "@dynui/privacy";

/**
 * Build the system + user prompt for an LLM provider.
 *
 * The system prompt is the stable, cacheable part: the contract rules + the
 * component vocabulary (compacted). The user message is the volatile part — but it
 * carries only a MINIMIZED profile projection: no anonId/identifier, no raw
 * behavior map, no sensitive fields; just the archetype and the specific allowed
 * signals the vocabulary's conditions reference. The model never sees who the user
 * is, and the server stamps the authoritative anonId after generation.
 */
export function buildPrompt(req: GenerationRequest): {
  system: string;
  user: string;
} {
  const { surface, manifest, constraints, profile, data, experiments } = req;

  // Pre-filter the vocabulary to components this user is actually eligible for:
  // right surface, audience match, allowed category, and (for canaries) an enabling
  // experiment assignment. The model can't pick what it isn't shown.
  const personalize = profile.consent?.personalization !== false;
  const arche = personalize ? profile.archetype?.primary : undefined;
  const secondary = personalize ? profile.archetype?.secondary : undefined;
  const allowedCats = constraints.allowedCategoriesBySurface?.[surface];
  const enabled = new Set((experiments ?? []).map((a) => `${a.experimentId}:${a.variant}`));

  const vocab = manifest.components.filter((c) => {
    if (!c.contract.surfaces.includes(surface)) return false;
    if (allowedCats && !allowedCats.includes(c.category)) return false;
    const aud = c.contract.audience;
    const audienceOk =
      aud.includes("*") ||
      (arche != null && aud.includes(arche)) ||
      (secondary != null && aud.includes(secondary));
    if (!audienceOk) return false;
    if (c.experiment && !enabled.has(`${c.experiment.id}:${c.experiment.enableForVariant}`)) {
      return false;
    }
    return true;
  });

  const system = [
    "You compose a per-user mobile screen as a SERVER-DRIVEN-UI tree.",
    "You do NOT write markup, styles, or new components. You ONLY arrange the",
    "registered components below into a UITree, choosing which to include, their",
    "order, prominence, and variant, based on the user's signals.",
    "",
    "Output rules (STRICT):",
    "- Output ONLY a single JSON object: the UITree. No prose, no markdown fences.",
    '- UITree shape: { "schemaVersion":"ui-tree/1.0", "surface", "generatedFor":{"anonId","archetype"}, "meta":{"generatedAt","model","cacheKey","experiments","fallback":false}, "root" }',
    '- Set generatedFor.anonId to "" — the server fills in the authoritative id. Never invent an id.',
    '- A node is { "type":"screen"|"section"|"component", ... }. screen/section have "children"[]; section may have "label". component has "componentId", "variant", optional "slots", "dataBindings", and a short "reason".',
    "- Use ONLY componentId values and variant ids from the vocabulary.",
    '- dataBindings map a name to a declared data key, e.g. {"series":"activity.hrZones"}.',
    "- Add a one-sentence \"reason\" per component (the explainability trail).",
    "",
    "Hard constraints you MUST satisfy:",
    `- maxModulesAboveFold: ${constraints.maxModulesAboveFold ?? "n/a"} (count components inside the section labeled \"above-the-fold\").`,
    `- neverHide (must appear): ${(constraints.neverHide ?? []).join(", ") || "none"}.`,
    `- pinned: ${(constraints.pinned ?? []).map((p) => `${p.componentId}@${p.position}`).join(", ") || "none"}.`,
    `- allowed categories on '${surface}': ${(constraints.allowedCategoriesBySurface?.[surface] ?? ["any"]).join(", ")}.`,
    "",
    "COMPONENT VOCABULARY:",
    vocab.map(describeComponent).join("\n"),
  ].join("\n");

  // Minimize what reaches the model: archetype + only the signals the vocabulary's
  // conditions reference (and pass the sensitivity allow-list). No identifiers, no
  // raw behavior map.
  const requiredSignals = ["archetype.primary", "archetype.secondary"];
  for (const c of vocab) {
    for (const cond of [...(c.contract.showWhen ?? []), ...(c.contract.hideWhen ?? [])]) {
      requiredSignals.push(cond.signal);
    }
  }
  const minimalProfile = minimizeProfileForPrompt(profile, { requiredSignals });

  const repair = req.options?.repairErrors;
  const userParts = [
    `Compose the '${surface}' screen for this user.`,
    "",
    "User signals (minimized — no identifiers):",
    JSON.stringify(minimalProfile, null, 2),
    "",
    "Resolved data (available keys for dataBindings):",
    JSON.stringify(Object.keys(data), null, 2),
    "",
    "Experiment assignments to honor:",
    JSON.stringify(experiments, null, 2),
  ];

  // Repair pass: hand back the rejected tree + the exact validation errors to fix.
  if (repair?.length && req.options?.seedTree) {
    userParts.push(
      "",
      "Your previous output FAILED validation. Fix every error below and return the",
      "corrected full UITree (not a diff). Do not introduce new violations.",
      "",
      "Previous output:",
      // Sanitize before serializing: blank the stamped anonId and scrub any
      // email/secret/identifier from the prior tree. The model never sees an id.
      JSON.stringify(sanitizeTreeForPrompt(req.options.seedTree)),
      "",
      "Validation errors:",
      ...repair.map((e) => `- [${e.code}] ${e.nodePath}: ${e.message}`),
    );
  }

  if (!personalize) {
    userParts.push(
      "",
      "This user has NOT consented to personalization. Produce a neutral default screen",
      "using only broadly-applicable components; do not tailor to behavior or archetype.",
    );
  }

  userParts.push("", "Return only the UITree JSON.");

  return { system, user: userParts.join("\n") };
}

function describeComponent(c: ComponentDef): string {
  const variants = c.variants.map((v) => v.id).join("|");
  const dataKeys = c.data
    .map((d) => `${d.key}${d.required ? "*" : ""}`)
    .join(", ");
  const k = c.contract;
  return [
    `- ${c.id} [${c.category}] variants:{${variants}}`,
    `    ${c.description}`,
    `    audience:${k.audience.join("/")} priority:${k.priority} prominence:${k.prominence ?? "-"}`,
    `    data:{${dataKeys}}`,
  ].join("\n");
}
