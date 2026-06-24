import type { ComponentManifest } from "@dynui/contracts";

export interface LintIssue {
  code: string;
  severity: "error" | "warning";
  componentId?: string;
  message: string;
}

export interface LintOptions {
  /** Treat deprecated components as a hard error rather than a warning. */
  deprecatedAsError?: boolean;
}

/**
 * Lint a ComponentManifest for authoring problems before it is used for
 * generation. Errors block; warnings inform. `lintPassed` is true when there are
 * no errors.
 */
export function lintManifest(m: ComponentManifest, opts: LintOptions = {}): LintIssue[] {
  const issues: LintIssue[] = [];
  const err = (code: string, message: string, componentId?: string) => issues.push({ code, severity: "error", message, componentId });
  const warn = (code: string, message: string, componentId?: string) => issues.push({ code, severity: "warning", message, componentId });

  const allowedCats = new Set(
    Object.values(m.constraints.allowedCategoriesBySurface ?? {}).flat(),
  );
  const hasAllowLists = (m.constraints.allowedCategoriesBySurface != null);

  for (const c of m.components) {
    if (!c.description || c.description.trim().length < 12) {
      err("missing-description", `'${c.id}' needs a meaningful description (the model reads it).`, c.id);
    }
    const k = c.contract;
    if (!k || !k.audience?.length || !k.surfaces?.length || k.priority == null) {
      err("weak-contract", `'${c.id}' has a weak behavioral contract (needs audience, surfaces, priority).`, c.id);
    }
    if (c.experiment && !(k?.goals?.length)) {
      err("missing-goals", `'${c.id}' is experiment-gated but declares no goals to judge it by.`, c.id);
    }
    if (!c.data?.length) {
      warn("missing-data", `'${c.id}' declares no data requirements.`, c.id);
    }
    const variantIds = c.variants.map((v) => v.id);
    if (new Set(variantIds).size !== variantIds.length) {
      err("ambiguous-variants", `'${c.id}' has duplicate variant ids.`, c.id);
    }
    if (hasAllowLists && !allowedCats.has(c.category)) {
      warn("unused-category", `'${c.id}' category '${c.category}' is not allowed on any surface.`, c.id);
    }
    const wildcard = k?.audience?.includes("*");
    const narrowed = (k?.showWhen?.length ?? 0) + (k?.hideWhen?.length ?? 0) > 0;
    if (wildcard && !narrowed && !(m.constraints.neverHide ?? []).includes(c.id)) {
      warn("wildcard-audience", `'${c.id}' targets everyone ('*') with no showWhen/hideWhen narrowing.`, c.id);
    }
    if (c.deprecated) {
      const msg = `'${c.id}' is deprecated${c.replacedBy ? `; use '${c.replacedBy}'` : ""}.`;
      if (opts.deprecatedAsError) err("deprecated", msg, c.id);
      else warn("deprecated", msg, c.id);
    }
  }

  return issues;
}

export const lintPassed = (issues: LintIssue[]): boolean => !issues.some((i) => i.severity === "error");
