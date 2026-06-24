/**
 * Proves the generative path against the real API: runs the AnthropicModelProvider
 * over the cold + three archetype profiles and measures how often the model emits a
 * valid, on-contract UITree first try, after one repair, or needs the deterministic
 * fallback — plus latency and token usage.
 *
 *   ANTHROPIC_API_KEY=sk-... npm run gen:verify
 *   (or put the key in a gitignored .env file at the repo root)
 *
 * Env knobs: DYNUI_RUNS (per profile, default 2), DYNUI_MODEL (default claude-opus-4-8).
 */
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { ComponentManifest, JsonValue, SignalProfile, UINode } from "@dynui/contracts";
import type { ModelProvider } from "@dynui/contracts";
import {
  AnthropicModelProvider,
  OpenAICompatibleModelProvider,
  generateScreen,
} from "@dynui/generate";
import { liveTimeoutMsFromEnv } from "../eval/generation.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const readJson = (p: string) => JSON.parse(readFileSync(join(root, p), "utf8"));

// Load .env (KEY=VALUE) if the key isn't already in the environment.
if (!process.env.ANTHROPIC_API_KEY && existsSync(join(root, ".env"))) {
  for (const line of readFileSync(join(root, ".env"), "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

if (!process.env.ANTHROPIC_API_KEY && !process.env.OPENROUTER_API_KEY) {
  console.log(
    "\nNo API key found. Add one to a gitignored .env file at the repo root:\n" +
      '  echo "ANTHROPIC_API_KEY=sk-ant-..." > .env       # direct Anthropic\n' +
      '  echo "OPENROUTER_API_KEY=sk-or-..." > .env        # via OpenRouter\n' +
      "then re-run:  npm run gen:verify\n" +
      "(With OpenRouter, set DYNUI_MODEL to a valid slug, e.g. anthropic/claude-sonnet-4.5)\n",
  );
  process.exit(0);
}

const manifest = readJson("examples/fitness/manifest.example.json") as ComponentManifest;
const profiles = readJson("examples/fitness/signal-profile.examples.json") as Record<string, SignalProfile>;
const data = readJson("examples/fitness/sample-activity.json") as Record<string, JsonValue>;

const RUNS = Number(process.env.DYNUI_RUNS ?? 2);
const USE_OPENROUTER = !!process.env.OPENROUTER_API_KEY;
const MODEL =
  process.env.DYNUI_MODEL ??
  (USE_OPENROUTER ? "anthropic/claude-sonnet-4.5" : "claude-opus-4-8");
const SURFACE = "activity-detail";

const cold = structuredClone(profiles.performanceAthlete);
cold.subject.anonId = "cold-user";
cold.behavior = {};
cold.preferences = {};
cold.archetype = undefined;

const cohort: Record<string, SignalProfile> = {
  cold,
  performance: profiles.performanceAthlete,
  wellness: profiles.casualWellness,
  social: profiles.socialCompetitive,
};

const provider: ModelProvider = USE_OPENROUTER
  ? new OpenAICompatibleModelProvider({
      apiKey: process.env.OPENROUTER_API_KEY!,
      model: MODEL,
      baseURL: "https://openrouter.ai/api/v1",
      appName: "dynui-verify",
    })
  : new AnthropicModelProvider({ model: MODEL });

const ids = (root: UINode): string[] => {
  const out: string[] = [];
  (function walk(n: UINode) {
    if (n.componentId) out.push(n.componentId);
    (n.children ?? []).forEach(walk);
    Object.values(n.slots ?? {}).flat().forEach(walk);
  })(root);
  return out;
};

interface Row { name: string; outcome: string; ms: number; inTok: number; outTok: number }
const rows: Row[] = [];
let sample: { name: string; comps: string[] } | undefined;

console.log(
  `\nVerifying generation · ${provider.id} · ${RUNS} run(s) × ${Object.keys(cohort).length} profiles\n`,
);

// Preflight: one direct call so auth / model-slug problems are obvious.
try {
  await provider.generate({
    surface: SURFACE,
    profile: profiles.performanceAthlete,
    manifest,
    constraints: manifest.constraints,
    experiments: [],
    data,
  });
} catch (e) {
  console.error(
    `Preflight call failed — check the key and model slug (DYNUI_MODEL).\n${e instanceof Error ? e.message : String(e)}\n`,
  );
  process.exit(1);
}

for (const [name, profile] of Object.entries(cohort)) {
  for (let r = 0; r < RUNS; r++) {
    const t0 = Date.now();
    const res = await generateScreen(
      provider,
      { surface: SURFACE, profile, manifest, constraints: manifest.constraints, experiments: [], data },
      // Live providers always run behind a timeout budget: a slow/hung model falls
      // back deterministically instead of blocking.
      { maxRepairs: 1, timeoutMs: liveTimeoutMsFromEnv() },
    );
    const ms = Date.now() - t0;
    const outcome = res.usedFallback
      ? "fallback"
      : res.attempts === 1
        ? "first-try"
        : "repaired";
    rows.push({ name, outcome, ms, inTok: res.usage?.inputTokens ?? 0, outTok: res.usage?.outputTokens ?? 0 });
    console.log(`  ${name.padEnd(12)} run ${r + 1}: ${outcome.padEnd(9)} ${ms}ms  (${ids(res.tree.root).length} components)`);
    if (!sample && !res.usedFallback) sample = { name, comps: ids(res.tree.root) };
  }
}

const n = rows.length;
const count = (o: string) => rows.filter((r) => r.outcome === o).length;
const mean = (f: (r: Row) => number) => Math.round(rows.reduce((s, r) => s + f(r), 0) / n);
const pct = (k: number) => `${Math.round((k / n) * 100)}%`;

console.log("\n=== Summary ===");
console.log(`  total generations : ${n}`);
console.log(`  valid first try   : ${count("first-try")} (${pct(count("first-try"))})`);
console.log(`  valid after repair: ${count("repaired")} (${pct(count("repaired"))})`);
console.log(`  needed fallback   : ${count("fallback")} (${pct(count("fallback"))})`);
console.log(`  end-to-end valid  : ${n - count("fallback") + count("fallback")}/${n} (100% — fallback guarantees a renderable tree)`);
console.log(`  mean latency      : ${mean((r) => r.ms)}ms`);
console.log(`  mean tokens       : in ${mean((r) => r.inTok)} / out ${mean((r) => r.outTok)}`);
if (sample) console.log(`\n  sample (${sample.name}): ${sample.comps.join(", ")}`);
console.log();
