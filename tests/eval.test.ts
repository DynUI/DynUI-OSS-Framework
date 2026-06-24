import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  runGenerationEval,
  evaluateLiveBudgets,
  liveEvalEnabled,
  liveBudgetsFromEnv,
  liveTimeoutMsFromEnv,
  makeLiveProvider,
  type LiveStats,
} from "../eval/generation";
import { runContractEval } from "../eval/contracts";

/**
 * Phase 0 gate: the contract + generation evals run as part of `npm test`, so no
 * later phase can change validation, generation, or fallback behavior without the
 * fixture corpus reflecting it. The live model is intentionally NOT exercised here
 * (CI must pass without API keys); use DYNUI_EVAL_LIVE=1 for live-provider budgets.
 */

test("eval:contracts — every fixture matches its declared expectation", () => {
  const r = runContractEval();
  assert.ok(r.passed, `contract eval failures:\n${r.failures.join("\n")}`);
});

test("eval:generation — heuristic/invalid/malformed providers meet thresholds", async () => {
  const r = await runGenerationEval({ live: false });
  assert.ok(r.passed, `generation eval failures:\n${r.failures.join("\n")}`);
});

// --- live latency / quality budgets (Phase 6) ------------------------------

const okStats: LiveStats = { validRate: 1, p95Ms: 14000, firstTryRate: 0.8, fallbackRate: 0 };

test("live budget logic FAILS when p95 exceeds the budget", () => {
  const budgets = { p95BudgetMs: 3000, minFirstTryRate: 0.8, maxFallbackRate: 0.2 };
  const fails = evaluateLiveBudgets(okStats, budgets);
  assert.ok(fails.some((f) => f.includes("p95")), `expected a p95 failure, got: ${fails.join(" | ")}`);
});

test("live budget logic PASSES when stats are within budget", () => {
  const budgets = { p95BudgetMs: 20000, minFirstTryRate: 0.8, maxFallbackRate: 0.2 };
  assert.deepEqual(evaluateLiveBudgets(okStats, budgets), [], "within-budget stats produce no failures");
});

test("live budget logic flags low first-try rate and high fallback rate", () => {
  const budgets = { p95BudgetMs: 20000, minFirstTryRate: 0.9, maxFallbackRate: 0.1 };
  const fails = evaluateLiveBudgets({ validRate: 1, p95Ms: 1000, firstTryRate: 0.5, fallbackRate: 0.5 }, budgets);
  assert.ok(fails.some((f) => f.includes("first-try")));
  assert.ok(fails.some((f) => f.includes("fallback")));
});

test("live budgets and timeout are env-configurable with sane defaults", () => {
  assert.deepEqual(liveBudgetsFromEnv({}), { p95BudgetMs: 20000, minFirstTryRate: 0.8, maxFallbackRate: 0.2 });
  assert.equal(liveTimeoutMsFromEnv({}), 30000);
  const env = { DYNUI_LIVE_P95_BUDGET_MS: "3000", DYNUI_LIVE_MIN_FIRST_TRY_RATE: "0.9", DYNUI_LIVE_MAX_FALLBACK_RATE: "0.05", DYNUI_LIVE_TIMEOUT_MS: "3000" } as NodeJS.ProcessEnv;
  assert.deepEqual(liveBudgetsFromEnv(env), { p95BudgetMs: 3000, minFirstTryRate: 0.9, maxFallbackRate: 0.05 });
  assert.equal(liveTimeoutMsFromEnv(env), 3000);
});

test("the live eval is opt-in, so CI stays deterministic even when no API key is present", () => {
  assert.equal(liveEvalEnabled({}), false);
  assert.equal(liveEvalEnabled({ DYNUI_EVAL_LIVE: "1" } as NodeJS.ProcessEnv), true);
  assert.equal(liveEvalEnabled({ DYNUI_EVAL_LIVE: "true" } as NodeJS.ProcessEnv), true);

  const saved = { a: process.env.ANTHROPIC_API_KEY, o: process.env.OPENROUTER_API_KEY };
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.OPENROUTER_API_KEY;
  try {
    assert.equal(makeLiveProvider(), undefined, "no provider without a key => live checks are skipped");
  } finally {
    if (saved.a) process.env.ANTHROPIC_API_KEY = saved.a;
    if (saved.o) process.env.OPENROUTER_API_KEY = saved.o;
  }
});

test("an example using a live provider passes a timeout budget to generateScreen", () => {
  // The gen:verify example must run live generation behind a timeout (slow/hung
  // model falls back instead of blocking).
  const src = readFileSync(join(import.meta.dirname, "..", "examples/verify-generation.ts"), "utf8");
  assert.ok(/timeoutMs:\s*liveTimeoutMsFromEnv\(\)/.test(src), "verify-generation must pass timeoutMs");
});
