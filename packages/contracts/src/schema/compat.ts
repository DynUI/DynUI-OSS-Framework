/**
 * Version support, cross-field compatibility checks, and migration scaffolding.
 *
 * `parse*` functions are the public entry points: they run the runtime schema,
 * enforce a supported schema version, and (for manifests/trees) apply cross-field
 * rules a single-pass schema can't express. Anything unknown — including a FUTURE
 * version — fails closed with an actionable message.
 */
import type { ComponentManifest, UITree, SignalProfile, SignalModel } from "../index.js";
import type { GenerationRequest } from "../model-provider.js";
import { type ParseResult, type SchemaIssue, parse } from "./core.js";
import {
  SEMVER,
  componentManifestSchema,
  generationRequestSchema,
  signalProfileSchema,
  uiTreeSchema,
  behaviorEventSchema,
  experimentDefSchema,
  signalModelSchema,
} from "./artifacts.js";

/** The schema version each artifact is currently authored at. */
export const SCHEMA_VERSIONS = {
  signalProfile: "signal-profile/1.0",
  componentManifest: "component-manifest/1.0",
  uiTree: "ui-tree/1.0",
  signalModel: "signal-model/1.0",
} as const;

/** Versions this build can consume. Migration may widen these over time. */
export const SUPPORTED_VERSIONS = {
  signalProfile: ["signal-profile/1.0"],
  componentManifest: ["component-manifest/1.0"],
  uiTree: ["ui-tree/1.0"],
  signalModel: ["signal-model/1.0"],
} as const;

function versionIssue(
  artifact: string,
  got: unknown,
  supported: readonly string[],
): SchemaIssue | null {
  if (typeof got !== "string" || !supported.includes(got)) {
    return {
      path: "/schemaVersion",
      code: "unsupported-version",
      message: `${artifact} schemaVersion ${JSON.stringify(got)} is not supported (supported: ${supported
        .map((s) => `'${s}'`)
        .join(", ")}). Run the matching migrate* helper or upgrade the package.`,
    };
  }
  return null;
}

/** Format issues into an actionable, multi-line string for errors/logs. */
export function formatIssues(issues: SchemaIssue[]): string {
  return issues.map((i) => `  ${i.path} [${i.code}] ${i.message}`).join("\n");
}

// --- cross-field compatibility --------------------------------------------

export function checkManifestCompatibility(m: ComponentManifest): SchemaIssue[] {
  const issues: SchemaIssue[] = [];
  const ids = new Set<string>();
  const categories = new Set<string>();

  m.components.forEach((c, i) => {
    if (ids.has(c.id)) {
      issues.push({ path: `/components/${i}/id`, code: "duplicate-component-id", message: `duplicate component id '${c.id}'` });
    }
    ids.add(c.id);
    categories.add(c.category);
    if (!SEMVER.test(c.version)) {
      issues.push({ path: `/components/${i}/version`, code: "bad-semver", message: `component '${c.id}' version '${c.version}' is not valid semver` });
    }
    if (c.experiment) {
      const ok = (s: string) => /^[\w.:-]+$/.test(s);
      if (!c.experiment.id || !ok(c.experiment.id)) {
        issues.push({ path: `/components/${i}/experiment/id`, code: "bad-experiment-id", message: `component '${c.id}' has a syntactically invalid experiment id '${c.experiment.id}'` });
      }
      if (!c.experiment.enableForVariant || !ok(c.experiment.enableForVariant)) {
        issues.push({ path: `/components/${i}/experiment/enableForVariant`, code: "bad-experiment-variant", message: `component '${c.id}' has a syntactically invalid experiment variant '${c.experiment.enableForVariant}'` });
      }
    }
  });

  const refs: { id: string; path: string }[] = [
    ...(m.constraints.neverHide ?? []).map((id, i) => ({ id, path: `/constraints/neverHide/${i}` })),
    ...(m.constraints.pinned ?? []).map((p, i) => ({ id: p.componentId, path: `/constraints/pinned/${i}/componentId` })),
    ...(m.constraints.stableAnchors ?? []).map((id, i) => ({ id, path: `/constraints/stableAnchors/${i}` })),
  ];
  for (const { id, path } of refs) {
    if (!ids.has(id)) {
      issues.push({ path, code: "constraint-ref-missing", message: `constraint references unknown component '${id}'` });
    }
  }

  for (const [surface, cats] of Object.entries(m.constraints.allowedCategoriesBySurface ?? {})) {
    cats.forEach((cat, i) => {
      if (!categories.has(cat)) {
        issues.push({ path: `/constraints/allowedCategoriesBySurface/${surface}/${i}`, code: "unknown-category", message: `allowed category '${cat}' on surface '${surface}' is not declared by any component` });
      }
    });
  }

  return issues;
}

// --- public parse entry points --------------------------------------------

function combine<T>(value: T, schemaResult: ParseResult<T>, extra: SchemaIssue[]): ParseResult<T> {
  if (!schemaResult.ok) return schemaResult;
  return extra.length ? { ok: false, issues: extra } : { ok: true, value };
}

export function parseSignalProfile(input: unknown): ParseResult<SignalProfile> {
  const r = parse(signalProfileSchema, input);
  if (!r.ok) return r;
  const vi = versionIssue("SignalProfile", r.value.schemaVersion, SUPPORTED_VERSIONS.signalProfile);
  return vi ? { ok: false, issues: [vi] } : r;
}

export function parseComponentManifest(input: unknown): ParseResult<ComponentManifest> {
  const r = parse(componentManifestSchema, input);
  if (!r.ok) return r;
  const issues: SchemaIssue[] = [];
  const vi = versionIssue("ComponentManifest", r.value.schemaVersion, SUPPORTED_VERSIONS.componentManifest);
  if (vi) issues.push(vi);
  issues.push(...checkManifestCompatibility(r.value));
  return combine(r.value, r, issues);
}

export function parseUITree(input: unknown): ParseResult<UITree> {
  const r = parse(uiTreeSchema, input);
  if (!r.ok) return r;
  const vi = versionIssue("UITree", r.value.schemaVersion, SUPPORTED_VERSIONS.uiTree);
  return vi ? { ok: false, issues: [vi] } : r;
}

/** Stable deep-equality for plain JSON-ish constraint objects. */
function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b || a === null || b === null) return false;
  if (typeof a !== "object") return false;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    return a.every((x, i) => deepEqual(x, b[i]));
  }
  const ao = a as Record<string, unknown>;
  const bo = b as Record<string, unknown>;
  const ak = Object.keys(ao);
  const bk = Object.keys(bo);
  if (ak.length !== bk.length) return false;
  return ak.every((k) => k in bo && deepEqual(ao[k], bo[k]));
}

const prefixPaths = (prefix: string, issues: SchemaIssue[]): SchemaIssue[] =>
  issues.map((i) => ({ ...i, path: `${prefix}${i.path}` }));

/**
 * Parsing a GenerationRequest is AT LEAST as strict as parsing each nested public
 * artifact independently: the embedded manifest gets the same version +
 * compatibility checks as `parseComponentManifest`, the profile and any seedTree
 * get the same version checks, and a `constraints` that diverges from
 * `manifest.constraints` is rejected. Nested issues keep clearly-prefixed paths.
 */
export function parseGenerationRequest(input: unknown): ParseResult<GenerationRequest> {
  const r = parse(generationRequestSchema, input);
  if (!r.ok) return r;
  const issues: SchemaIssue[] = [];

  // profile: version check
  const pv = versionIssue("SignalProfile", r.value.profile.schemaVersion, SUPPORTED_VERSIONS.signalProfile);
  if (pv) issues.push({ ...pv, path: `/profile${pv.path}` });

  // manifest: version + full cross-field compatibility (dup ids, semver, refs, …)
  const mv = versionIssue("ComponentManifest", r.value.manifest.schemaVersion, SUPPORTED_VERSIONS.componentManifest);
  if (mv) issues.push({ ...mv, path: `/manifest${mv.path}` });
  issues.push(...prefixPaths("/manifest", checkManifestCompatibility(r.value.manifest)));

  // constraints: must not diverge from the manifest's own constraints (the
  // canonical source). Identical-by-value (or the same reference) is fine.
  if (!deepEqual(r.value.constraints, r.value.manifest.constraints)) {
    issues.push({
      path: "/constraints",
      code: "constraints-divergent",
      message: "request.constraints diverges from manifest.constraints; omit it or keep it identical to manifest.constraints",
    });
  }

  // options.seedTree: version check when present
  const seed = r.value.options?.seedTree;
  if (seed) {
    const sv = versionIssue("UITree", seed.schemaVersion, SUPPORTED_VERSIONS.uiTree);
    if (sv) issues.push({ ...sv, path: `/options/seedTree${sv.path}` });
  }

  return issues.length ? { ok: false, issues } : r;
}

export function parseBehaviorEvent(input: unknown) {
  return parse(behaviorEventSchema, input);
}

export function parseExperimentDef(input: unknown) {
  return parse(experimentDefSchema, input);
}

export function parseSignalModel(input: unknown): ParseResult<SignalModel> {
  const r = parse(signalModelSchema, input) as ParseResult<SignalModel>;
  if (!r.ok) return r;
  const issues: SchemaIssue[] = [];
  const vi = versionIssue("SignalModel", r.value.schemaVersion, SUPPORTED_VERSIONS.signalModel);
  if (vi) issues.push(vi);
  const ids = new Set<string>();
  r.value.segments.forEach((s, i) => {
    if (ids.has(s.id)) issues.push({ path: `/segments/${i}/id`, code: "duplicate-segment-id", message: `duplicate segment id '${s.id}'` });
    ids.add(s.id);
  });
  if (r.value.coldStart?.segment && !ids.has(r.value.coldStart.segment)) {
    issues.push({ path: "/coldStart/segment", code: "unknown-segment", message: `coldStart.segment '${r.value.coldStart.segment}' is not a declared segment` });
  }
  return issues.length ? { ok: false, issues } : r;
}

// --- migration scaffolding -------------------------------------------------

/**
 * Bring a manifest of any SUPPORTED version up to the current schema and validate
 * it. Today only one version exists, so this is identity-after-validate; the place
 * to add per-version upgrade steps is here, before the final parse. Unsupported or
 * future versions fail closed.
 */
export function migrateManifest(input: unknown): ComponentManifest {
  const r = parseComponentManifest(input);
  if (!r.ok) {
    throw new Error(`Cannot migrate ComponentManifest:\n${formatIssues(r.issues)}`);
  }
  return r.value;
}

export function migrateUITree(input: unknown): UITree {
  const r = parseUITree(input);
  if (!r.ok) {
    throw new Error(`Cannot migrate UITree:\n${formatIssues(r.issues)}`);
  }
  return r.value;
}
