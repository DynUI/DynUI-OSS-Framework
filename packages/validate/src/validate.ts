import type {
  ComponentManifest,
  ComponentDef,
  DataType,
  ExperimentAssignment,
  JsonValue,
  SignalProfile,
  UITree,
  UINode,
  ValidationResult,
  ValidationError,
} from "@dynui/contracts";
import { evalCondition } from "@dynui/signal";

/**
 * Request context that turns the validator into the full SAFETY BOUNDARY. Without
 * it, validateTree does manifest-only structural checks (back-compat). With it, it
 * additionally enforces surface/audience/consent eligibility, data-type binding,
 * experiment assignment honesty, and stable-anchor stability — everything a
 * generated screen must satisfy before a device renders it.
 */
export interface ValidateContext {
  /** The surface that was requested (defaults to tree.surface if omitted). */
  surface?: string;
  /** Who the screen was composed for — enables eligibility/consent/data checks. */
  profile?: SignalProfile;
  /** Resolved data bundle — enables data existence + type checks. */
  data?: Record<string, JsonValue>;
  /** Experiment assignments that were supplied to generation. */
  experiments?: ExperimentAssignment[];
  /** Previous stable tree, for stable-anchor order checks. */
  previousTree?: UITree;
  /** If set, tree.meta.fallback must equal this (fallback-flag honesty). */
  expectFallback?: boolean;
}

/**
 * The context the RENDER GATE requires. Unlike {@link ValidateContext} (where every
 * field is optional to support the manifest-only back-compat mode), all four
 * request-relative inputs are MANDATORY here, because each one switches on a class of
 * safety check:
 *
 *  - `surface`     → surface match + surface eligibility
 *  - `profile`     → consent / audience / showWhen / hideWhen / subject match / a11y
 *  - `data`        → data-binding existence + type checks (pass `{}` if truly none)
 *  - `experiments` → experiment-assignment honesty (pass `[]` if none)
 *
 * Omitting any of them would silently skip those checks, so {@link validateRenderableTree}
 * rejects an incomplete context at runtime rather than validating a tree against a
 * weaker boundary than the caller thinks.
 */
export interface RenderableValidateContext {
  /** The surface that was requested. */
  surface: string;
  /** Who the screen was composed for. */
  profile: SignalProfile;
  /** Resolved data bundle (use `{}` when the surface genuinely needs no data). */
  data: Record<string, JsonValue>;
  /** Experiment assignments supplied to generation (use `[]` when there are none). */
  experiments: ExperimentAssignment[];
  /** Previous stable tree, for stable-anchor order checks. */
  previousTree?: UITree;
  /** If set, tree.meta.fallback must equal this (fallback-flag honesty). */
  expectFallback?: boolean;
}

const UNSAFE_PROP = /<\s*script|<\s*iframe|javascript:|on\w+\s*=/i;
const RESERVED_PROPS = new Set(["accessibilityLabel"]);

/**
 * STRUCTURAL validation only (manifest-only). Checks the tree against the manifest
 * vocabulary, slots, props, variants, and global constraints — but it does **not**
 * enforce consent, surface/audience eligibility, data binding existence/types,
 * experiment-assignment honesty, or fallback-flag honesty, because those need the
 * request context. This is a useful authoring/lint check, but it is **not the render
 * gate**. Use {@link validateRenderableTree} before rendering.
 */
export function validateTreeStructure(
  tree: UITree,
  manifest: ComponentManifest,
): ValidationResult {
  return validateTree(tree, manifest);
}

/**
 * The FULL render gate — the production safety boundary. In addition to the
 * structural checks, it enforces: surface match, subject match,
 * surface/audience/consent eligibility, hard `showWhen`/`hideWhen`, data existence +
 * types, accessibility, experiment-assignment honesty, and the fallback flag. **Call
 * this before a device renders a tree.**
 *
 * The full {@link RenderableValidateContext} is REQUIRED — `surface`, `profile`,
 * `data`, and `experiments` must all be present (use `{}` / `[]` for genuinely empty
 * data/experiments). A missing field throws, because silently skipping a class of
 * safety check is exactly the failure this gate exists to prevent.
 */
export function validateRenderableTree(
  tree: UITree,
  manifest: ComponentManifest,
  context: RenderableValidateContext,
): ValidationResult {
  if (context == null || typeof context !== "object") {
    throw new TypeError(
      "validateRenderableTree requires a full render context { surface, profile, data, experiments }. " +
        "For manifest-only structural checks use validateTreeStructure(tree, manifest).",
    );
  }
  const missing: string[] = [];
  // surface must be a non-empty string; the others must be present (empty {}/[] is ok).
  if (typeof context.surface !== "string" || context.surface.length === 0) missing.push("surface");
  if (context.profile == null) missing.push("profile");
  if (context.data == null) missing.push("data");
  if (context.experiments == null) missing.push("experiments");
  if (missing.length > 0) {
    throw new TypeError(
      `validateRenderableTree is the render gate and requires full context; missing/invalid: ` +
        `${missing.join(", ")}. Each gates a class of safety check (surface→eligibility, ` +
        `profile→consent/audience, data→bindings, experiments→assignment honesty). ` +
        `Pass {} for empty data and [] for no experiments; for structural-only checks use ` +
        `validateTreeStructure(tree, manifest).`,
    );
  }
  return validateTree(tree, manifest, context);
}

export function validateTree(
  tree: UITree,
  manifest: ComponentManifest,
  context?: ValidateContext,
): ValidationResult {
  const errors: ValidationError[] = [];
  const byId = new Map(manifest.components.map((c) => [c.id, c]));
  const constraints = manifest.constraints;
  const surface = context?.surface ?? tree.surface;
  const allowedCats = constraints.allowedCategoriesBySurface?.[surface];
  const profile = context?.profile;
  const personalize = profile ? profile.consent?.personalization !== false : true;
  const neverHide = new Set(constraints.neverHide ?? []);
  const singletons = new Set(constraints.singletons ?? []);

  const enabledExperiments = new Set(
    (tree.meta?.experiments ?? []).map((a) => `${a.experimentId}:${a.variant}`),
  );

  const present = new Set<string>();
  const counts = new Map<string, number>();
  let aboveFoldCount = 0;
  let componentCount = 0;
  let maxDepthSeen = 0;

  const err = (code: ValidationError["code"], nodePath: string, message: string) =>
    errors.push({ code, nodePath, message });

  const audienceMatch = (def: ComponentDef): boolean => {
    const aud = def.contract.audience;
    if (aud.includes("*")) return true;
    const a = profile?.archetype;
    return !!a && (aud.includes(a.primary) || (a.secondary != null && aud.includes(a.secondary)));
  };

  function checkData(def: ComponentDef, node: UINode, path: string) {
    const dataKeys = new Map(def.data.map((d) => [d.key, d]));
    const boundSrcs = new Set(Object.values(node.dataBindings ?? {}));
    for (const [k, src] of Object.entries(node.dataBindings ?? {})) {
      if (!dataKeys.has(src)) {
        err("unknown-data-binding", path, `Binding '${k}' -> '${src}' is not a declared data key of '${def.id}'`);
        continue;
      }
      if (context?.data) {
        if (!(src in context.data)) {
          err("data-not-in-bundle", path, `Binding '${k}' -> '${src}' is not present in the resolved data bundle`);
        } else if (!matchesType(context.data[src], dataKeys.get(src)!.type)) {
          err("data-type-mismatch", path, `Data '${src}' should be ${dataKeys.get(src)!.type}, got ${jsType(context.data[src])}`);
        }
      }
    }
    for (const d of def.data) {
      if (d.required && !boundSrcs.has(d.key)) {
        err("missing-required-data", path, `Required data '${d.key}' not bound for '${def.id}'`);
      }
    }
  }

  function checkProps(def: ComponentDef, node: UINode, path: string) {
    if (!node.props) return;
    const declared = new Map((def.props ?? []).map((p) => [p.name, p]));
    for (const [name, value] of Object.entries(node.props)) {
      const ppath = `${path}/props.${name}`;
      if (scanUnsafe(value)) {
        err("unsafe-prop-value", ppath, `Prop '${name}' contains unsafe markup/executable content`);
      }
      if (RESERVED_PROPS.has(name)) {
        if (typeof value !== "string") err("prop-type-mismatch", ppath, `Reserved prop '${name}' must be a string`);
        continue;
      }
      const pdef = declared.get(name);
      if (!pdef) {
        err("prop-not-declared", ppath, `'${def.id}' does not declare prop '${name}' (arbitrary props are disallowed)`);
      } else if (!matchesType(value, pdef.type)) {
        err("prop-type-mismatch", ppath, `Prop '${name}' should be ${pdef.type}, got ${jsType(value)}`);
      }
    }
  }

  function checkEligibility(def: ComponentDef, node: UINode, path: string) {
    const exempt = neverHide.has(def.id);

    if (!def.contract.surfaces.includes(surface)) {
      err("surface-ineligible", path, `'${def.id}' is not eligible on surface '${surface}'`);
    }
    if (!profile) return; // remaining checks need a profile

    if (!personalize) {
      if (!def.contract.audience.includes("*") && !exempt) {
        err("consent-violation", path, `'${def.id}' targets a specific audience but consent.personalization is false`);
      }
      return; // under no consent we ignore archetype/behavior-driven rules
    }

    if (!exempt && !audienceMatch(def)) {
      err("audience-ineligible", path, `'${def.id}' audience ${JSON.stringify(def.contract.audience)} does not match the user`);
    }
    if (!exempt) {
      for (const cond of def.contract.showWhen ?? []) {
        if (cond.weight == null && !evalCondition(profile, cond)) {
          err("show-when-failed", path, `'${def.id}' requires ${cond.signal} ${cond.op} ${JSON.stringify(cond.value)}`);
        }
      }
      for (const cond of def.contract.hideWhen ?? []) {
        if (evalCondition(profile, cond)) {
          err("hide-when-violated", path, `'${def.id}' is suppressed by ${cond.signal} ${cond.op} ${JSON.stringify(cond.value)}`);
        }
      }
    }
  }

  function checkA11y(def: ComponentDef, node: UINode, path: string) {
    const a = def.a11y;
    if (!a) return;
    if (a.requiresLabel) {
      const label = node.props?.accessibilityLabel;
      if (typeof label !== "string" || label.trim() === "") {
        err("a11y-missing-label", path, `'${def.id}' is interactive and requires a non-empty 'accessibilityLabel' prop`);
      }
    }
    if (a.reducedMotionSafe === false && profile?.context?.device?.reducedMotion === true) {
      err("a11y-reduced-motion", path, `'${def.id}' is not reduced-motion safe but the user requested reduced motion`);
    }
    if (a.requiresTextFallback) {
      const stringKeys = new Set(def.data.filter((d) => d.type === "string").map((d) => d.key));
      const hasText = Object.values(node.dataBindings ?? {}).some((src) => stringKeys.has(src));
      if (!hasText) {
        err("a11y-missing-text-fallback", path, `'${def.id}' must bind at least one string data key as a text fallback`);
      }
    }
  }

  function walk(node: UINode, path: string, inAboveFold: boolean, depth: number) {
    maxDepthSeen = Math.max(maxDepthSeen, depth);

    if (node.type === "component") {
      componentCount++;
      const def = byId.get(node.componentId ?? "");
      if (!def) {
        err("unknown-component", path, `Unknown component '${node.componentId}'`);
        return;
      }
      present.add(def.id);
      counts.set(def.id, (counts.get(def.id) ?? 0) + 1);
      if (inAboveFold) aboveFoldCount++;

      if (node.variant && !def.variants.some((v) => v.id === node.variant)) {
        err("unknown-variant", path, `'${def.id}' has no variant '${node.variant}'`);
      }
      if (allowedCats && !allowedCats.includes(def.category)) {
        err("constraint-violation", path, `Category '${def.category}' not allowed on surface '${surface}'`);
      }
      if (
        def.experiment &&
        !enabledExperiments.has(`${def.experiment.id}:${def.experiment.enableForVariant}`)
      ) {
        err("constraint-violation", path, `'${def.id}' is gated behind experiment '${def.experiment.id}' (variant '${def.experiment.enableForVariant}') but the tree carries no such assignment`);
      }

      checkData(def, node, path);
      checkProps(def, node, path);
      if (context) {
        checkEligibility(def, node, path);
        checkA11y(def, node, path);
      }

      // Slots: known ids, accepted categories, required present.
      const slotDefs = new Map(def.slots.map((s) => [s.id, s]));
      for (const [slotId, children] of Object.entries(node.slots ?? {})) {
        const sd = slotDefs.get(slotId);
        if (!sd) {
          err("unknown-slot", path, `'${def.id}' has no slot '${slotId}'`);
          continue;
        }
        children.forEach((child, i) => {
          const childPath = `${path}/slots.${slotId}[${i}]`;
          if (child.type === "component") {
            const cdef = byId.get(child.componentId ?? "");
            if (
              cdef &&
              !(sd.accepts.includes("*") || sd.accepts.includes(cdef.category) || sd.accepts.includes(cdef.id))
            ) {
              err("slot-category-mismatch", childPath, `Slot '${slotId}' does not accept '${cdef.category}'`);
            }
          }
          walk(child, childPath, false, depth + 1);
        });
      }
      for (const s of def.slots) {
        if (s.required && !node.slots?.[s.id]?.length) {
          err("missing-required-slot", path, `Required slot '${s.id}' missing for '${def.id}'`);
        }
      }
    } else {
      const aboveFold = inAboveFold || node.label === "above-the-fold";
      (node.children ?? []).forEach((ch, i) => walk(ch, `${path}/children[${i}]`, aboveFold, depth + 1));
    }
  }

  // Root invariant (structural — always checked).
  if (tree.root?.type !== "screen") {
    err("root-not-screen", "root", `Tree root must be type 'screen', got '${tree.root?.type}'`);
  }

  // Root-shape contract: a screen's children must be UNAMBIGUOUSLY all sections or
  // all components — never a mix. A mixed root would let the renderer resolve only
  // the sections and silently drop the direct components.
  {
    const rc = tree.root?.children ?? [];
    const hasSection = rc.some((c) => c.type === "section");
    const hasComponent = rc.some((c) => c.type === "component");
    if (hasSection && hasComponent) {
      err("mixed-root-children", "root", "Root children must be all sections or all components, not a mix (the renderer would drop the direct components)");
    }
  }

  walk(tree.root, "root", false, 0);

  // --- root & metadata invariants (require context) -------------------------
  if (context) {
    if (tree.surface !== surface) {
      err("surface-mismatch", "/surface", `Tree surface '${tree.surface}' does not match requested '${surface}'`);
    }
    if (profile && tree.generatedFor?.anonId !== profile.subject.anonId) {
      err("subject-mismatch", "/generatedFor/anonId", `Tree generatedFor.anonId '${tree.generatedFor?.anonId}' does not match profile subject '${profile.subject.anonId}'`);
    }
    if (context.experiments && !sameAssignments(tree.meta?.experiments ?? [], context.experiments)) {
      err("experiments-mismatch", "/meta/experiments", `meta.experiments does not match the supplied assignments`);
    }
    if (context.expectFallback != null && (tree.meta?.fallback ?? false) !== context.expectFallback) {
      err("fallback-flag-mismatch", "/meta/fallback", `meta.fallback is ${tree.meta?.fallback}; expected ${context.expectFallback}`);
    }
    if (context.previousTree) {
      checkStableAnchors(tree, context.previousTree, constraints.stableAnchors ?? [], err);
    }
  }

  // --- global constraints (manifest-only) -----------------------------------
  for (const id of constraints.neverHide ?? []) {
    if (!present.has(id)) err("constraint-violation", "root", `neverHide: '${id}' is missing from the tree`);
  }
  if (constraints.maxModulesAboveFold != null && aboveFoldCount > constraints.maxModulesAboveFold) {
    err("constraint-violation", "root", `Above-the-fold has ${aboveFoldCount} modules; max is ${constraints.maxModulesAboveFold}`);
  }
  if (constraints.maxDepth != null && maxDepthSeen > constraints.maxDepth) {
    err("max-depth-exceeded", "root", `Tree depth ${maxDepthSeen} exceeds max ${constraints.maxDepth}`);
  }
  if (constraints.maxComponents != null && componentCount > constraints.maxComponents) {
    err("max-components-exceeded", "root", `Tree has ${componentCount} components; max is ${constraints.maxComponents}`);
  }
  for (const id of singletons) {
    if ((counts.get(id) ?? 0) > 1) {
      err("duplicate-component", "root", `'${id}' is a singleton but appears ${counts.get(id)} times`);
    }
  }

  const order = componentOrder(tree.root);
  for (const p of constraints.pinned ?? []) {
    if (p.position === "top" && order[0] !== p.componentId) {
      err("constraint-violation", "root", `pinned top: '${p.componentId}' must be first`);
    }
    if (p.position === "bottom" && order[order.length - 1] !== p.componentId) {
      err("constraint-violation", "root", `pinned bottom: '${p.componentId}' must be last`);
    }
  }

  return { ok: errors.length === 0, errors };
}

function checkStableAnchors(
  tree: UITree,
  prev: UITree,
  anchorList: string[],
  err: (code: ValidationError["code"], path: string, msg: string) => void,
) {
  const anchors = new Set(anchorList);
  const cur = componentOrder(tree.root).filter((id) => anchors.has(id));
  const before = componentOrder(prev.root).filter((id) => anchors.has(id));
  const common = cur.filter((id) => before.includes(id));
  const prevCommon = before.filter((id) => common.includes(id));
  for (let i = 0; i < common.length; i++) {
    if (common[i] !== prevCommon[i]) {
      err("stable-anchor-violation", "root", `stable anchor order changed: was [${prevCommon.join(", ")}], now [${common.join(", ")}]`);
      return;
    }
  }
}

function sameAssignments(a: ExperimentAssignment[], b: ExperimentAssignment[]): boolean {
  const key = (x: ExperimentAssignment) => `${x.experimentId}:${x.variant}`;
  const sa = new Set(a.map(key));
  const sb = new Set(b.map(key));
  return sa.size === sb.size && [...sa].every((k) => sb.has(k));
}

function matchesType(value: unknown, type: DataType): boolean {
  switch (type) {
    case "string": return typeof value === "string";
    case "number": return typeof value === "number" && !Number.isNaN(value);
    case "boolean": return typeof value === "boolean";
    case "series": return Array.isArray(value);
    case "geojson":
    case "object": return value !== null && typeof value === "object" && !Array.isArray(value);
    case "any": return true;
    default: return true;
  }
}

function jsType(v: unknown): string {
  return v === null ? "null" : Array.isArray(v) ? "array" : typeof v;
}

function scanUnsafe(value: unknown): boolean {
  if (typeof value === "string") return UNSAFE_PROP.test(value);
  if (Array.isArray(value)) return value.some(scanUnsafe);
  if (value !== null && typeof value === "object") return Object.values(value).some(scanUnsafe);
  return false;
}

function componentOrder(root: UINode): string[] {
  const out: string[] = [];
  (function rec(n: UINode) {
    if (n.type === "component" && n.componentId) out.push(n.componentId);
    (n.children ?? []).forEach(rec);
    Object.values(n.slots ?? {})
      .flat()
      .forEach(rec);
  })(root);
  return out;
}
