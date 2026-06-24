/**
 * The RENDERER REGISTRY CONTRACT — RN-free so it can be checked at build time
 * (before the app ever receives a tree) and unit tested without a device.
 *
 * Each registered renderer declares what it supports; `checkRendererCompat`
 * proves a manifest is renderable against the registry. The phase gate: if a tree
 * validates, this check must prove the renderer can render it.
 */
export interface RendererSpec {
  componentId: string;
  /** Supported variant ids; ["*"] = any variant. */
  variants: string[];
  /** Supported slot ids; ["*"] = any slot. [] = leaf (no slots). */
  slots: string[];
  /** Data keys the renderer consumes; ["*"] = tolerant of any. */
  data: string[];
  accessibility?: { interactive?: boolean };
  /** Manifest component major version the renderer supports, e.g. "1.x" or "*". */
  componentVersionRange?: string;
}

export interface RendererCompatIssue {
  code:
    | "missing-renderer"
    | "unsupported-variant"
    | "unsupported-slot"
    | "missing-data-consumer"
    | "version-mismatch"
    | "unsupported-token";
  componentId: string;
  message: string;
}

/** Minimal structural manifest shape (avoids coupling the app to @dynui/contracts). */
export interface ManifestLike {
  components: {
    id: string;
    version: string;
    variants: { id: string }[];
    slots: { id: string; required: boolean }[];
    data: { key: string; required: boolean }[];
  }[];
  /** Tokens the renderer must support to render this manifest. */
  requiredTokens?: string[];
}

function majorOf(version: string): string {
  return version.split(".")[0] ?? "";
}

/** Supports "*", and "N.x" / "N" major-version ranges. */
function versionSatisfies(version: string, range: string): boolean {
  if (range === "*") return true;
  const want = range.split(".")[0];
  return majorOf(version) === want;
}

/** Design tokens the renderer can theme. A manifest's requiredTokens must subset this. */
export const SUPPORTED_TOKENS = ["color.accent", "radius.card", "surface.style"];

export function checkRendererCompat(
  manifest: ManifestLike,
  specs: RendererSpec[],
  opts: { supportedTokens?: string[] } = {},
): RendererCompatIssue[] {
  const issues: RendererCompatIssue[] = [];
  const byId = new Map(specs.map((s) => [s.componentId, s]));
  const supportedTokens = new Set(opts.supportedTokens ?? SUPPORTED_TOKENS);

  for (const token of manifest.requiredTokens ?? []) {
    if (!supportedTokens.has(token)) {
      issues.push({ code: "unsupported-token", componentId: "(manifest)", message: `manifest requires token '${token}' which the renderer does not support` });
    }
  }

  for (const c of manifest.components) {
    const spec = byId.get(c.id);
    if (!spec) {
      issues.push({ code: "missing-renderer", componentId: c.id, message: `no registered renderer for '${c.id}'` });
      continue;
    }
    const anyVariant = spec.variants.includes("*");
    for (const v of c.variants) {
      if (!anyVariant && !spec.variants.includes(v.id)) {
        issues.push({ code: "unsupported-variant", componentId: c.id, message: `renderer for '${c.id}' does not support variant '${v.id}'` });
      }
    }
    const anySlot = spec.slots.includes("*");
    for (const slot of c.slots) {
      if (slot.required && !anySlot && !spec.slots.includes(slot.id)) {
        issues.push({ code: "unsupported-slot", componentId: c.id, message: `renderer for '${c.id}' has no path for required slot '${slot.id}'` });
      }
    }
    const tolerantData = spec.data.includes("*");
    if (!tolerantData) {
      for (const d of c.data) {
        if (d.required && !spec.data.includes(d.key)) {
          issues.push({ code: "missing-data-consumer", componentId: c.id, message: `renderer for '${c.id}' does not consume required data '${d.key}'` });
        }
      }
    }
    if (spec.componentVersionRange && !versionSatisfies(c.version, spec.componentVersionRange)) {
      issues.push({ code: "version-mismatch", componentId: c.id, message: `renderer for '${c.id}' supports ${spec.componentVersionRange} but manifest declares ${c.version}` });
    }
  }
  return issues;
}

/**
 * Renderer specs for the registered components. Must stay in lockstep with
 * `registry.tsx` — the unit test cross-checks that every spec has a component.
 */
export const rendererSpecs: RendererSpec[] = [
  { componentId: "activity-headline", variants: ["standard", "with-photo"], slots: [], data: ["*"], componentVersionRange: "1.x" },
  { componentId: "recovery-score-card", variants: ["compact", "expanded"], slots: [], data: ["*"], componentVersionRange: "1.x" },
  { componentId: "training-load-chart", variants: ["sparkline", "full"], slots: [], data: ["*"], componentVersionRange: "1.x" },
  { componentId: "hr-zone-breakdown", variants: ["bars"], slots: [], data: ["*"], componentVersionRange: "1.x" },
  { componentId: "split-table", variants: ["essential", "full"], slots: [], data: ["*"], componentVersionRange: "1.x" },
  { componentId: "route-map-hero", variants: ["map", "map-photo"], slots: [], data: ["*"], componentVersionRange: "1.x" },
  { componentId: "insight-card", variants: ["standard"], slots: [], data: ["*"], componentVersionRange: "1.x" },
  { componentId: "social-kudos-bar", variants: ["standard"], slots: [], data: ["*"], componentVersionRange: "1.x" },
  { componentId: "segment-leaderboard", variants: ["standard"], slots: [], data: ["*"], componentVersionRange: "1.x" },
  { componentId: "strength-volume-card", variants: ["standard"], slots: [], data: ["*"], componentVersionRange: "0.x" },
  // Composition demo (slots manifest): a container that nests a metric in `body`
  // and anything in `footer`.
  { componentId: "panel-title", variants: ["standard"], slots: [], data: ["*"], componentVersionRange: "1.x" },
  { componentId: "dashboard-panel", variants: ["standard"], slots: ["*"], data: ["*"], componentVersionRange: "1.x" },
  { componentId: "mini-metric", variants: ["compact"], slots: [], data: ["*"], componentVersionRange: "1.x" },
  { componentId: "mini-chart", variants: ["sparkline"], slots: [], data: ["*"], componentVersionRange: "1.x" },
];
