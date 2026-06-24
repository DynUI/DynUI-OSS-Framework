/**
 * eval:contracts — runs every contract/validator fixture against its declared
 * expectation and prints a concise pass/fail summary. Exits non-zero on any
 * mismatch so CI fails when contract behavior regresses.
 *
 *   npm run eval:contracts
 */
import { join } from "node:path";
import type { ComponentManifest, JsonValue, SignalProfile, UITree } from "@dynui/contracts";
import { validateTree, type ValidateContext } from "@dynui/validate";
import {
  FIX,
  ROOT,
  readJson,
  manifests,
  dataBundles,
  checkManifest,
  checkProfile,
} from "./fixtures.js";
import type { CaseCtx } from "./contracts-cases.js";
import {
  validTreeCases,
  invalidTreeCases,
  manifestCases,
  profileCases,
  type TreeCase,
} from "./contracts-cases.js";

export interface EvalResult {
  passed: boolean;
  total: number;
  failures: string[];
  summary: string;
}

function buildContext(ctx: CaseCtx): ValidateContext {
  const profile = ctx.profile
    ? (readJson(join(FIX, "profiles/valid", `${ctx.profile}.json`)) as SignalProfile)
    : undefined;
  return {
    profile,
    surface: ctx.surface,
    data: ctx.data ? (dataBundles[ctx.data] as Record<string, JsonValue>) : undefined,
    experiments: ctx.experiments,
  };
}

function checkTreeCase(c: TreeCase): string | null {
  const tree = readJson(join(FIX, "trees", c.file)) as UITree;
  const manifest = manifests[c.manifest];
  const r = validateTree(tree, manifest, c.ctx ? buildContext(c.ctx) : undefined);

  const expect = c.expect;
  if (expect.ok) {
    if (!r.ok) return `${c.file}: expected VALID, got errors: ${r.errors.map((e) => e.code).join(", ")}`;
    return null;
  }
  if (r.ok) return `${c.file}: expected INVALID (${expect.code}), but it validated`;
  const hit = r.errors.find(
    (e) => e.code === expect.code && (!expect.messageMatch || e.message.includes(expect.messageMatch)),
  );
  if (!hit) {
    return `${c.file}: expected error ${expect.code}${
      expect.messageMatch ? ` ~ /${expect.messageMatch}/` : ""
    }, got: ${r.errors.map((e) => `${e.code}:${e.message}`).join(" | ")}`;
  }
  return null;
}

export function runContractEval(): EvalResult {
  const failures: string[] = [];
  let total = 0;

  for (const c of [...validTreeCases, ...invalidTreeCases]) {
    total++;
    const f = checkTreeCase(c);
    if (f) failures.push(f);
  }

  // Canonical fitness manifest must be structurally clean.
  total++;
  const fitnessIssues = checkManifest(
    readJson(join(ROOT, "examples/fitness/manifest.example.json")) as ComponentManifest,
  );
  if (fitnessIssues.length) failures.push(`examples/fitness/manifest.example.json: unexpected issues ${fitnessIssues.map((i) => i.code).join(", ")}`);

  for (const c of manifestCases) {
    total++;
    const issues = checkManifest(readJson(join(FIX, c.file)));
    if (c.valid && issues.length) failures.push(`${c.file}: expected clean manifest, got ${issues.map((i) => i.code).join(", ")}`);
    if (!c.valid && issues.length === 0) failures.push(`${c.file}: expected structural issues, found none`);
  }

  for (const c of profileCases) {
    total++;
    const issues = checkProfile(readJson(join(FIX, c.file)));
    if (c.valid && issues.length) failures.push(`${c.file}: expected clean profile, got ${issues.map((i) => i.code).join(", ")}`);
    if (!c.valid && issues.length === 0) failures.push(`${c.file}: expected structural issues, found none`);
  }

  const passed = failures.length === 0;
  const summary = `contracts eval: ${total - failures.length}/${total} fixtures matched expectations`;
  return { passed, total, failures, summary };
}

// CLI entry.
if (import.meta.filename === process.argv[1]) {
  const r = runContractEval();
  console.log(r.summary);
  if (!r.passed) {
    console.error(`\n${r.failures.length} mismatch(es):`);
    for (const f of r.failures) console.error(`  ✗ ${f}`);
    process.exit(1);
  }
  console.log("✓ all contract fixtures matched expectations");
}
