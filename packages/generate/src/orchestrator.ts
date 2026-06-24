import type {
  GenerationRequest,
  GenerationResult,
  ModelProvider,
  UITree,
  ValidationResult,
} from "@dynui/contracts";
import { validateRenderableTree, type RenderableValidateContext } from "@dynui/validate";
import { redactError } from "@dynui/privacy";
import { composeHeuristic } from "./heuristic.js";
import type { RankPolicy } from "./policy.js";
import { normalizeTree, type NormalizeLimits } from "./normalize.js";

/** Build the full request context the render gate enforces against. */
function contextFor(req: GenerationRequest, expectFallback: boolean): RenderableValidateContext {
  return {
    surface: req.surface,
    profile: req.profile,
    data: req.data,
    experiments: req.experiments,
    expectFallback,
  };
}

/** Observable per-generation diagnostics (no app path depends on model success). */
export interface GenerationDiagnostics {
  outcome: "first-try" | "repaired" | "fallback";
  attempts: number;
  latencyMs: number;
  /** Validation error codes seen across attempts (the error distribution). */
  validationErrorCodes: string[];
  fallbackReason?: string;
}

export interface ScreenResult {
  tree: UITree;
  validation: ValidationResult;
  usedFallback: boolean;
  /**
   * TRUE only in the explicit non-renderable branch: the deterministic fallback
   * could not produce a valid tree (a `neverHide` component lacks required
   * baseline data and no `fallbackData` covers it). When `unrenderable` is true,
   * `validation.ok` is false and callers MUST NOT render `tree` — they should show
   * their own safe empty/error state. Whenever `unrenderable` is false (the normal
   * path), `validation.ok` is guaranteed true.
   */
  unrenderable?: boolean;
  /** How many provider calls were made (1 + repair attempts). */
  attempts: number;
  usage?: { inputTokens: number; outputTokens: number };
  diagnostics: GenerationDiagnostics;
}

export interface GenerateOptions {
  maxRepairs?: number;
  policy?: RankPolicy;
  /** Latency budget per provider call (ms). Exceeding it cancels and falls back. */
  timeoutMs?: number;
  /** Structural limits enforced during normalization. */
  limits?: NormalizeLimits;
}

/** Race a provider call against a latency budget, cancelling via AbortController. */
async function callWithBudget(
  provider: ModelProvider,
  req: GenerationRequest,
  timeoutMs?: number,
): Promise<GenerationResult> {
  if (!timeoutMs || timeoutMs <= 0) return provider.generate(req);
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  try {
    return await Promise.race([
      provider.generate(req, { signal: ac.signal }),
      new Promise<never>((_, reject) => {
        ac.signal.addEventListener("abort", () =>
          reject(new Error(`provider exceeded ${timeoutMs}ms latency budget`)),
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * The generation loop: provider.generate → normalize → validate → (repair) →
 * fallback. No app render path depends on model success: a timeout, throw,
 * malformed output, or invalid output always yields a VALID fallback tree plus
 * observable diagnostics.
 */
export async function generateScreen(
  provider: ModelProvider,
  req: GenerationRequest,
  opts?: GenerateOptions,
): Promise<ScreenResult> {
  const maxRepairs = opts?.maxRepairs ?? 0;
  const t0 = Date.now();
  let attempts = 0;
  let usage: ScreenResult["usage"];
  let seedTree: UITree | undefined;
  let lastErrors: ValidationResult["errors"] = [];
  const errorCodes: string[] = [];

  const done = (reason?: string): GenerationDiagnostics["outcome"] =>
    reason ? "fallback" : attempts > 1 ? "repaired" : "first-try";

  try {
    for (let i = 0; i <= maxRepairs; i++) {
      attempts++;
      const attemptReq: GenerationRequest =
        i === 0 ? req : { ...req, options: { ...req.options, seedTree, repairErrors: lastErrors } };

      const result = await callWithBudget(provider, attemptReq, opts?.timeoutMs);
      usage = result.usage ?? usage;

      // Normalize before validate: strip unknown fields; reject oversized/unknown nodes.
      const norm = normalizeTree(result.tree, opts?.limits ?? {});
      if (!norm.ok) {
        return finishFallback(req, `normalization(${provider.id}): ${norm.issues.find((x) => !x.startsWith("stripped")) ?? norm.issues[0]}`, opts?.policy, attempts, t0, errorCodes, usage);
      }
      // The model never receives the anonId. We stamp the authoritative id only on
      // an INTERNAL copy used for validation and the returned result; the model's
      // own (unstamped) output becomes the repair seed, so the repair prompt can
      // never serialize a server-stamped identifier back to the provider.
      const modelTree = norm.tree;
      const tree: UITree = {
        ...modelTree,
        ...(modelTree.generatedFor
          ? { generatedFor: { ...modelTree.generatedFor, anonId: req.profile.subject.anonId } }
          : {}),
      };

      const validation = validateRenderableTree(tree, req.manifest, contextFor(req, false));
      if (validation.ok) {
        return {
          tree,
          validation,
          usedFallback: false,
          attempts,
          usage,
          diagnostics: { outcome: done(), attempts, latencyMs: Date.now() - t0, validationErrorCodes: errorCodes },
        };
      }
      for (const e of validation.errors) errorCodes.push(e.code);
      seedTree = modelTree;
      lastErrors = validation.errors;
    }
    return finishFallback(req, `invalid-output(${provider.id})`, opts?.policy, attempts, t0, errorCodes, usage);
  } catch (e) {
    // Redact: a provider error can embed an API key or other secret.
    return finishFallback(req, `error(${provider.id}): ${redactError(e)}`, opts?.policy, Math.max(1, attempts), t0, errorCodes, usage);
  }
}

function finishFallback(
  req: GenerationRequest,
  why: string,
  policy: RankPolicy | undefined,
  attempts: number,
  t0: number,
  errorCodes: string[],
  usage: ScreenResult["usage"],
): ScreenResult {
  // Fill any caller-supplied placeholder data so a neverHide component that needs
  // baseline data still renders. Real data always wins over a fallback value.
  const fallbackData = req.options?.fallbackData;
  const effReq: GenerationRequest = fallbackData
    ? { ...req, data: { ...fallbackData, ...req.data } }
    : req;

  const tree = composeHeuristic(effReq, policy);
  tree.meta.fallback = true;
  tree.meta.model = `fallback:${why}`;
  const validation = validateRenderableTree(tree, effReq.manifest, contextFor(effReq, true));

  // PHASE GATE: the framework must never return a "normal" renderable result with
  // validation.ok === false. If the deterministic fallback itself can't be made
  // valid (missing required baseline data with no fallbackData), return the
  // explicit non-renderable branch instead — callers cannot mistake it for a safe
  // screen.
  if (!validation.ok) {
    const codes = validation.errors.map((e) => e.code);
    for (const c of codes) errorCodes.push(c);
    return {
      tree,
      validation,
      usedFallback: true,
      unrenderable: true,
      attempts,
      usage,
      diagnostics: {
        outcome: "fallback",
        attempts,
        latencyMs: Date.now() - t0,
        validationErrorCodes: errorCodes,
        fallbackReason: `missing-required-baseline-data: ${why} [${[...new Set(codes)].join(",")}]`,
      },
    };
  }

  return {
    tree,
    validation,
    usedFallback: true,
    attempts,
    usage,
    diagnostics: { outcome: "fallback", attempts, latencyMs: Date.now() - t0, validationErrorCodes: errorCodes, fallbackReason: why },
  };
}
