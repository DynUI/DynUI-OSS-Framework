/**
 * eval:generation — proves the generation contract across the fixture corpus:
 * whatever a provider does, the orchestrator must yield a VALID tree, falling back
 * deterministically when the provider misbehaves.
 *
 * Thresholds are encoded in code (THRESHOLDS) so CI fails on regression.
 *
 *   npm run eval:generation
 *   DYNUI_EVAL_LIVE=1 ANTHROPIC_API_KEY=... npm run eval:generation
 */
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import type {
  GenerationRequest,
  JsonValue,
  ModelProvider,
  SignalProfile,
} from "@dynui/contracts";
import {
  HeuristicModelProvider,
  AnthropicModelProvider,
  OpenAICompatibleModelProvider,
  generateScreen,
} from "@dynui/generate";
import { FIX, ROOT, readJson, manifests, dataBundles } from "./fixtures.js";
import {
  InvalidModelProvider,
  MalformedModelProvider,
  ThrowingModelProvider,
  SlowModelProvider,
} from "./mock-providers.js";

/** Pass/fail thresholds. Editing prose can't loosen these — CI checks the numbers. */
export const THRESHOLDS = {
  heuristicValidRate: 1.0, // heuristic generation: 100% valid, never fallback
  heuristicFallbackRate: 0.0,
  invalidFallbackRate: 1.0, // invalid provider: 100% fallback...
  invalidValidRate: 1.0, // ...and every fallback is valid
  malformedFallbackRate: 1.0, // malformed provider: 100% fallback...
  malformedValidRate: 1.0, // ...and every fallback is valid
  realValidRate: 1.0, // live model: 100% end-to-end valid after repair or fallback
  renderableFallbackValidRate: 1.0, // every RENDERABLE fallback is valid
  invalidRenderableFallbackRate: 0.0, // never a renderable result that is invalid
} as const;

const SCENARIO_FILES = [
  "profiles/valid/performance.json",
  "profiles/valid/wellness.json",
  "profiles/valid/social.json",
  "profiles/valid/cold-start.json",
  "profiles/valid/no-consent.json",
];

const SURFACE = "activity-detail";

function scenarios(): { name: string; req: GenerationRequest }[] {
  return SCENARIO_FILES.map((f) => {
    const profile = readJson(join(FIX, f)) as SignalProfile;
    return {
      name: f.split("/").pop()!.replace(".json", ""),
      req: {
        surface: SURFACE,
        profile,
        manifest: manifests.fitness,
        constraints: manifests.fitness.constraints,
        experiments: [],
        data: dataBundles.fitness as Record<string, never>,
      },
    };
  });
}

interface ProviderRun {
  validRate: number;
  fallbackRate: number;
  firstTryRate: number;
  /** Fraction of results that are presented as renderable yet invalid (must be 0). */
  renderableInvalidRate: number;
  p95Ms: number;
  meanInTok: number;
  meanOutTok: number;
  n: number;
}

const p95 = (xs: number[]) => (xs.length ? [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor(xs.length * 0.95))] : 0);

async function runProvider(
  provider: ModelProvider,
  maxRepairs: number,
  genOpts: { timeoutMs?: number } = {},
): Promise<ProviderRun> {
  const cases = scenarios();
  let valid = 0;
  let fallback = 0;
  let firstTry = 0;
  let renderableInvalid = 0;
  let inTok = 0;
  let outTok = 0;
  const latencies: number[] = [];
  for (const c of cases) {
    const res = await generateScreen(provider, c.req, { maxRepairs, ...genOpts });
    if (res.validation.ok) valid++;
    if (res.usedFallback) fallback++;
    if (res.diagnostics.outcome === "first-try") firstTry++;
    // Renderable + invalid is the forbidden combination: a result the app would
    // render while validation failed. The unrenderable branch is exempt.
    if (!res.unrenderable && !res.validation.ok) renderableInvalid++;
    latencies.push(res.diagnostics.latencyMs);
    inTok += res.usage?.inputTokens ?? 0;
    outTok += res.usage?.outputTokens ?? 0;
  }
  const n = cases.length;
  return {
    validRate: valid / n,
    fallbackRate: fallback / n,
    firstTryRate: firstTry / n,
    renderableInvalidRate: renderableInvalid / n,
    p95Ms: p95(latencies),
    meanInTok: Math.round(inTok / n),
    meanOutTok: Math.round(outTok / n),
    n,
  };
}

/** A scenario whose data bundle is missing a neverHide component's required key. */
function missingBaselineReq(withFallbackData: boolean): GenerationRequest {
  const profile = readJson(join(FIX, "profiles/valid/performance.json")) as SignalProfile;
  const full = dataBundles.fitness as Record<string, JsonValue>;
  const { ["activity.headlineStat"]: _omit, ...thin } = full;
  return {
    surface: SURFACE,
    profile,
    manifest: manifests.fitness,
    constraints: manifests.fitness.constraints,
    experiments: [],
    data: thin as Record<string, never>,
    options: withFallbackData ? { fallbackData: { "activity.headlineStat": "—" } } : undefined,
  };
}

function loadDotEnv() {
  if (process.env.ANTHROPIC_API_KEY || process.env.OPENROUTER_API_KEY) return;
  const p = join(ROOT, ".env");
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

export interface GenerationEvalResult {
  passed: boolean;
  failures: string[];
  lines: string[];
}

/**
 * Live-provider budgets. Generation MODES have different latency expectations:
 *
 *  - request-time generation        — tight p95 (set DYNUI_LIVE_P95_BUDGET_MS≈3000)
 *  - session-boundary / background   — looser p95 (the defaults below)
 *  - cache warming                   — latency largely irrelevant
 *  - deterministic-only              — no live model at all
 *
 * The DEFAULTS reflect the supported live mode here (background / session-boundary /
 * cache-warming): live model generation should happen BEFORE render or behind a
 * timeout budget, and the request-time path should use deterministic generation or
 * cached trees. To assert request-time safety, tighten the p95 budget via env.
 */
export interface LiveBudgets {
  p95BudgetMs: number;
  minFirstTryRate: number;
  maxFallbackRate: number;
}

export const DEFAULT_LIVE_BUDGETS: LiveBudgets = {
  p95BudgetMs: 20000,
  minFirstTryRate: 0.8,
  maxFallbackRate: 0.2,
};

/**
 * Per-call latency budget for live providers, in ms. Live model generation should
 * always run behind a timeout so a slow/hung provider falls back deterministically
 * rather than blocking. The default is generous (background/session-boundary mode);
 * a request-time path should set this much lower.
 */
export function liveTimeoutMsFromEnv(env: NodeJS.ProcessEnv = process.env): number {
  const v = env.DYNUI_LIVE_TIMEOUT_MS;
  const n = v == null || v === "" ? NaN : Number(v);
  return Number.isFinite(n) ? n : 30000;
}

export function liveBudgetsFromEnv(env: NodeJS.ProcessEnv = process.env): LiveBudgets {
  const num = (k: string, d: number) => {
    const v = env[k];
    const n = v == null || v === "" ? NaN : Number(v);
    return Number.isFinite(n) ? n : d;
  };
  return {
    p95BudgetMs: num("DYNUI_LIVE_P95_BUDGET_MS", DEFAULT_LIVE_BUDGETS.p95BudgetMs),
    minFirstTryRate: num("DYNUI_LIVE_MIN_FIRST_TRY_RATE", DEFAULT_LIVE_BUDGETS.minFirstTryRate),
    maxFallbackRate: num("DYNUI_LIVE_MAX_FALLBACK_RATE", DEFAULT_LIVE_BUDGETS.maxFallbackRate),
  };
}

export interface LiveStats {
  validRate: number;
  p95Ms: number;
  firstTryRate: number;
  fallbackRate: number;
}

/** Pure budget check: returns one message per violated threshold (empty = pass). */
export function evaluateLiveBudgets(s: LiveStats, b: LiveBudgets): string[] {
  const f: string[] = [];
  if (s.validRate < THRESHOLDS.realValidRate) f.push(`live end-to-end valid rate ${pct(s.validRate)} < ${pct(THRESHOLDS.realValidRate)}`);
  if (s.p95Ms > b.p95BudgetMs) f.push(`live p95 ${s.p95Ms}ms exceeds budget ${b.p95BudgetMs}ms`);
  if (s.firstTryRate < b.minFirstTryRate) f.push(`live first-try rate ${pct(s.firstTryRate)} < min ${pct(b.minFirstTryRate)}`);
  if (s.fallbackRate > b.maxFallbackRate) f.push(`live fallback rate ${pct(s.fallbackRate)} > max ${pct(b.maxFallbackRate)}`);
  return f;
}

export async function runGenerationEval(opts?: { live?: boolean }): Promise<GenerationEvalResult> {
  const failures: string[] = [];
  const lines: string[] = [];
  const expect = (cond: boolean, msg: string) => {
    if (!cond) failures.push(msg);
  };

  // Across EVERY provider run, a renderable result must never be invalid.
  const noRenderableInvalid = (run: ProviderRun, name: string) =>
    expect(run.renderableInvalidRate <= THRESHOLDS.invalidRenderableFallbackRate, `${name} returned a renderable-but-invalid result (rate ${run.renderableInvalidRate})`);

  const heur = await runProvider(new HeuristicModelProvider(), 0);
  lines.push(`  heuristic : valid ${pct(heur.validRate)}  fallback ${pct(heur.fallbackRate)}  (n=${heur.n})`);
  expect(heur.validRate >= THRESHOLDS.heuristicValidRate, `heuristic valid rate ${heur.validRate} < ${THRESHOLDS.heuristicValidRate}`);
  expect(heur.fallbackRate <= THRESHOLDS.heuristicFallbackRate, `heuristic fallback rate ${heur.fallbackRate} > ${THRESHOLDS.heuristicFallbackRate}`);
  noRenderableInvalid(heur, "heuristic");

  const inv = await runProvider(new InvalidModelProvider(), 0);
  lines.push(`  invalid   : valid ${pct(inv.validRate)}  fallback ${pct(inv.fallbackRate)}  (n=${inv.n})`);
  expect(inv.fallbackRate >= THRESHOLDS.invalidFallbackRate, `invalid fallback rate ${inv.fallbackRate} < ${THRESHOLDS.invalidFallbackRate}`);
  expect(inv.validRate >= THRESHOLDS.invalidValidRate, `invalid valid rate ${inv.validRate} < ${THRESHOLDS.invalidValidRate}`);
  noRenderableInvalid(inv, "invalid");

  const mal = await runProvider(new MalformedModelProvider(), 0);
  lines.push(`  malformed : valid ${pct(mal.validRate)}  fallback ${pct(mal.fallbackRate)}  (n=${mal.n})`);
  expect(mal.fallbackRate >= THRESHOLDS.malformedFallbackRate, `malformed fallback rate ${mal.fallbackRate} < ${THRESHOLDS.malformedFallbackRate}`);
  expect(mal.validRate >= THRESHOLDS.malformedValidRate, `malformed valid rate ${mal.validRate} < ${THRESHOLDS.malformedValidRate}`);
  noRenderableInvalid(mal, "malformed");

  // --- fallback validity contract (Phase 2) --------------------------------
  // A neverHide component whose required baseline data is missing must EITHER be
  // made renderable by fallbackData, OR be returned as an explicit non-renderable
  // result — never as a renderable-looking invalid tree.
  const withFD = await generateScreen(new ThrowingModelProvider(), missingBaselineReq(true), { maxRepairs: 0 });
  const withoutFD = await generateScreen(new ThrowingModelProvider(), missingBaselineReq(false), { maxRepairs: 0 });
  const renderableValid = withFD.usedFallback && !withFD.unrenderable && withFD.validation.ok ? 1 : 0;
  const renderableInvalid = (!withFD.unrenderable && !withFD.validation.ok ? 1 : 0) + (!withoutFD.unrenderable && !withoutFD.validation.ok ? 1 : 0);
  lines.push(`  missing-baseline : with-fallbackData ${withFD.validation.ok ? "valid+renderable" : "INVALID"}  without ${withoutFD.unrenderable ? "non-renderable(typed)" : "RENDERABLE?"}`);
  expect(renderableValid >= THRESHOLDS.renderableFallbackValidRate, "fallbackData must yield a valid renderable tree for a missing-baseline neverHide component");
  expect(renderableInvalid <= THRESHOLDS.invalidRenderableFallbackRate, "missing-baseline data must never be returned as a renderable invalid tree");
  expect(withoutFD.unrenderable === true && withoutFD.validation.ok === false, "missing baseline data with no fallbackData must be an explicit non-renderable result");

  const thr = await runProvider(new ThrowingModelProvider(), 0);
  lines.push(`  throwing  : valid ${pct(thr.validRate)}  fallback ${pct(thr.fallbackRate)}  (n=${thr.n})`);
  expect(thr.fallbackRate >= 1 && thr.validRate >= 1, "throwing provider must fall back to a valid tree every time");
  noRenderableInvalid(thr, "throwing");

  const budgetMs = 100;
  const slow = await runProvider(new SlowModelProvider(5000), 0, { timeoutMs: budgetMs });
  lines.push(`  slow/timeout : valid ${pct(slow.validRate)}  fallback ${pct(slow.fallbackRate)}  p95 ${slow.p95Ms}ms (budget ${budgetMs}ms)`);
  expect(slow.fallbackRate >= 1 && slow.validRate >= 1, "slow provider must fall back to a valid tree");
  expect(slow.p95Ms < budgetMs + 500, `slow provider must fall back within the latency budget (p95 ${slow.p95Ms}ms)`);
  noRenderableInvalid(slow, "slow");

  if (opts?.live) {
    loadDotEnv();
    const provider = makeLiveProvider();
    if (!provider) {
      lines.push("  real      : skipped (no ANTHROPIC_API_KEY / OPENROUTER_API_KEY) — live latency/quality budgets NOT enforced");
    } else {
      const real = await runProvider(provider, 1);
      const budgets = liveBudgetsFromEnv();
      lines.push(`  real (${provider.id}): valid ${pct(real.validRate)}  fallback ${pct(real.fallbackRate)}  first-try ${pct(real.firstTryRate)}  p95 ${real.p95Ms}ms  tok ${real.meanInTok}/${real.meanOutTok}  (n=${real.n})`);
      lines.push(`  budgets   : p95<=${budgets.p95BudgetMs}ms  first-try>=${pct(budgets.minFirstTryRate)}  fallback<=${pct(budgets.maxFallbackRate)}`);
      noRenderableInvalid(real, "real");
      for (const f of evaluateLiveBudgets({ validRate: real.validRate, p95Ms: real.p95Ms, firstTryRate: real.firstTryRate, fallbackRate: real.fallbackRate }, budgets)) {
        failures.push(f);
      }
    }
  } else {
    lines.push("  real      : skipped (set DYNUI_EVAL_LIVE=1 with ANTHROPIC_API_KEY or OPENROUTER_API_KEY to enforce live budgets)");
  }

  return { passed: failures.length === 0, failures, lines };
}

export function makeLiveProvider(): ModelProvider | undefined {
  if (process.env.OPENROUTER_API_KEY) {
    return new OpenAICompatibleModelProvider({
      apiKey: process.env.OPENROUTER_API_KEY,
      model: process.env.DYNUI_MODEL ?? "anthropic/claude-sonnet-4.5",
      baseURL: "https://openrouter.ai/api/v1",
      appName: "dynui-eval",
    });
  }
  if (process.env.ANTHROPIC_API_KEY) {
    return new AnthropicModelProvider({ model: process.env.DYNUI_MODEL ?? "claude-opus-4-8" });
  }
  return undefined;
}

const pct = (r: number) => `${Math.round(r * 100)}%`;

export function liveEvalEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const v = env.DYNUI_EVAL_LIVE?.toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

// CLI entry. Live-provider budgets are opt-in so local .env files do not make the
// default CI/public-readiness command depend on provider latency.
if (import.meta.filename === process.argv[1]) {
  const r = await runGenerationEval({ live: liveEvalEnabled() });
  console.log("generation eval:");
  for (const l of r.lines) console.log(l);
  if (!r.passed) {
    console.error(`\n${r.failures.length} threshold failure(s):`);
    for (const f of r.failures) console.error(`  ✗ ${f}`);
    process.exit(1);
  }
  console.log("✓ all generation thresholds met");
}
