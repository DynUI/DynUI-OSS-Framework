import type {
  ComponentDef,
  GenerationRequest,
  JsonValue,
  NodeExplanation,
  SignalProfile,
  UINode,
  UITree,
} from "@dynui/contracts";
import { evalCondition } from "@dynui/signal";
import { type RankPolicy, resolvePolicy } from "./policy.js";
import { buildCacheKey, cacheContextFromProfile } from "./cache-key.js";

/**
 * Deterministic, rule-based composition — the no-LLM provider AND the guaranteed
 * fallback. It must be production-grade: valid, deterministic, privacy-safe, and
 * domain-configurable (Phase 3).
 *
 * Composition runs as explicit stages:
 *   1. eligibility — hard gates (surface, audience, consent, showWhen/hideWhen, data)
 *   2. scoring     — ranking nudges from weighted showWhen + base priority
 *   3. layout      — sort, pin, cap, split above-the-fold
 *   4. variant     — pick a density variant
 *   5. explanation — structured "why is this here" per component
 *   6. (validation happens in the orchestrator against the full safety boundary)
 */
export function composeHeuristic(req: GenerationRequest, policy?: RankPolicy): UITree {
  const pol = resolvePolicy(policy);
  const { surface, profile, manifest, constraints, data, experiments } = req;

  const personalize = profile.consent?.personalization !== false;
  const conf = profile.archetype?.confidence ?? 0;
  const cold = !profile.archetype || conf < pol.minConfidence;
  const usingArchetype = personalize && !cold;
  // Segment archetype drives audience eligibility + scoring; masked when we treat
  // the user as neutral (no consent, or low-confidence cold start).
  const segArche = usingArchetype ? profile.archetype!.primary : undefined;
  const segSecondary = usingArchetype ? profile.archetype!.secondary : undefined;

  const neverHide = new Set(constraints.neverHide ?? []);
  const allowedCats = constraints.allowedCategoriesBySurface?.[surface];
  const enabledExperiments = new Set(
    (experiments ?? []).map((a) => `${a.experimentId}:${a.variant}`),
  );

  const hasRequiredData = (def: ComponentDef): boolean =>
    def.data.every((d) => !d.required || data[d.key] !== undefined);

  // --- STAGE 1: eligibility --------------------------------------------------
  const candidates: Candidate[] = [];
  for (const def of manifest.components) {
    const elig: string[] = [];
    if (!def.contract.surfaces.includes(surface)) continue;
    if (allowedCats && !allowedCats.includes(def.category)) continue;
    if (def.experiment && !enabledExperiments.has(`${def.experiment.id}:${def.experiment.enableForVariant}`)) continue;
    elig.push(`surface:${surface}`);

    const aud = def.contract.audience;
    const neutral = aud.includes("*");
    const audienceOk = personalize
      ? neutral ||
        (segArche != null && aud.includes(segArche)) ||
        (segSecondary != null && aud.includes(segSecondary))
      : neutral;
    if (!audienceOk) continue;
    elig.push(neutral ? "audience:*" : `audience:${segArche != null && aud.includes(segArche) ? segArche : segSecondary}`);

    // Hard showWhen / hideWhen evaluate against the REAL profile (matches the
    // validator), but only when personalization consent is granted.
    if (personalize) {
      let suppressed = false;
      for (const cond of def.contract.showWhen ?? []) {
        if (cond.weight == null && !evalCondition(profile, cond)) suppressed = true;
      }
      for (const cond of def.contract.hideWhen ?? []) {
        if (evalCondition(profile, cond)) suppressed = true;
      }
      if (suppressed) continue;
    }

    // Missing required data suppresses (unless neverHide forces it through, where
    // the validator will then surface a clear data error).
    if (!hasRequiredData(def) && !neverHide.has(def.id)) continue;
    elig.push("data:ok");

    candidates.push({ def, basePriority: def.contract.priority ?? 0, score: 0, eligibility: elig, nudges: [] });
  }

  // --- STAGE 2: scoring ------------------------------------------------------
  for (const c of candidates) {
    c.score = c.basePriority;
    if (!usingArchetype) continue;
    for (const cond of c.def.contract.showWhen ?? []) {
      if (cond.weight != null && evalCondition(profile, cond)) {
        const mult = pol.signalWeights?.[cond.signal] ?? 1;
        const delta = cond.weight * pol.weightScale * mult;
        c.score += delta;
        c.nudges.push({ signal: cond.signal, delta });
      }
    }
  }

  // De-duplicate (first-wins) and guarantee neverHide presence.
  const chosen = new Map<string, Candidate>();
  for (const c of candidates) if (!chosen.has(c.def.id)) chosen.set(c.def.id, c);
  for (const id of neverHide) {
    if (!chosen.has(id)) {
      const def = manifest.components.find((c) => c.id === id);
      if (def) {
        chosen.set(id, {
          def,
          basePriority: def.contract.priority ?? 0,
          score: def.contract.priority ?? 0,
          eligibility: [`surface:${surface}`],
          nudges: [],
          fallbackReason: "neverHide: always present",
        });
      }
    }
  }

  // --- STAGE 3: layout -------------------------------------------------------
  let list = [...chosen.values()].sort(
    (a, b) => b.score - a.score || b.basePriority - a.basePriority || a.def.id.localeCompare(b.def.id),
  );

  const pinnedTop = (constraints.pinned ?? []).filter((p) => p.position === "top").map((p) => p.componentId);
  const pinnedBottom = (constraints.pinned ?? []).filter((p) => p.position === "bottom").map((p) => p.componentId);
  const pinnedSet = new Set([...pinnedTop, ...pinnedBottom]);

  // Cap total modules (policy), always retaining neverHide + pinned.
  if (pol.maxModules != null && list.length > pol.maxModules) {
    const mustKeep = list.filter((c) => neverHide.has(c.def.id) || pinnedSet.has(c.def.id));
    const rest = list.filter((c) => !neverHide.has(c.def.id) && !pinnedSet.has(c.def.id));
    list = [...mustKeep, ...rest].slice(0, Math.max(pol.maxModules, mustKeep.length));
    list.sort((a, b) => b.score - a.score || b.basePriority - a.basePriority || a.def.id.localeCompare(b.def.id));
  }

  const pick = (id: string) => chosen.get(id);
  list = [
    ...pinnedTop.map(pick).filter((c): c is Candidate => !!c),
    ...list.filter((c) => !pinnedSet.has(c.def.id)),
    ...pinnedBottom.map(pick).filter((c): c is Candidate => !!c),
  ];

  const maxAbove = constraints.maxModulesAboveFold ?? list.length;
  const aboveFoldIds = new Set(list.slice(0, maxAbove).map((c) => c.def.id));
  const rest = list.slice(maxAbove);
  const aboveFold = list.slice(0, maxAbove);

  // --- STAGE 4 + 5: nodes with variants + structured explanations -----------
  const toNode = (c: Candidate): UINode => {
    const placement: string[] = [];
    if (pinnedTop.includes(c.def.id)) placement.push("pinned:top");
    if (pinnedBottom.includes(c.def.id)) placement.push("pinned:bottom");
    if (neverHide.has(c.def.id)) placement.push("neverHide");
    if (aboveFoldIds.has(c.def.id)) placement.push("above-fold");

    const explanation: NodeExplanation = {
      eligibility: c.eligibility,
      nudges: c.nudges,
      basePriority: c.basePriority,
      score: c.score,
      ...(placement.length ? { constraints: placement } : {}),
      ...(c.fallbackReason ? { fallbackReason: c.fallbackReason } : {}),
    };

    return {
      type: "component",
      componentId: c.def.id,
      variant: pickVariant(c.def, profile, usingArchetype),
      dataBindings: Object.fromEntries(
        c.def.data.filter((d) => d.required || data[d.key] !== undefined).map((d) => [d.key, d.key]),
      ),
      reason: humanReason(c),
      explanation,
    };
  };

  const children: UINode[] = [
    { type: "section", label: "above-the-fold", children: aboveFold.map(toNode) },
  ];
  if (rest.length) children.push({ type: "section", label: "details", children: rest.map(toNode) });

  const cacheKey = buildCacheKey({
    manifestVersion: manifest.registry.version,
    surface,
    segment: segArche ?? "neutral",
    secondary: segSecondary,
    experiments,
    context: cacheContextFromProfile(profile),
  });

  return {
    schemaVersion: "ui-tree/1.0",
    surface,
    generatedFor: { anonId: profile.subject.anonId, archetype: segArche },
    meta: {
      generatedAt: new Date().toISOString(),
      model: "heuristic:dynui-rules",
      cacheKey,
      experiments,
      fallback: false,
    },
    root: { type: "screen", children },
  };
}

interface Candidate {
  def: ComponentDef;
  basePriority: number;
  score: number;
  eligibility: string[];
  nudges: { signal: string; delta: number }[];
  fallbackReason?: string;
}

const COMPACT_HINTS = ["compact", "sparkline", "essential", "standard"];
const RICH_HINTS = ["full", "expanded", "data-rich", "map-photo"];

function pickVariant(def: ComponentDef, profile: SignalProfile, usingArchetype: boolean): string | undefined {
  if (!def.variants.length) return undefined;
  const ids = def.variants.map((v) => v.id);
  const density = profile.preferences["ui.density"];
  const wantsRich =
    (usingArchetype && profile.archetype?.primary === "performance") || density === "comfortable";

  if (wantsRich) {
    const rich = ids.find((id) => RICH_HINTS.includes(id));
    if (rich) return rich;
  } else {
    const compact = ids.find((id) => COMPACT_HINTS.includes(id));
    if (compact) return compact;
  }
  return ids[0];
}

function humanReason(c: Candidate): string {
  if (c.fallbackReason) return c.fallbackReason;
  const base = `priority ${c.basePriority}, score ${c.score}`;
  return c.nudges.length ? `${base}; matched ${c.nudges.map((n) => n.signal).join(", ")}` : base;
}
