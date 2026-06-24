// One-shot: emit the valid fitness-based tree fixtures from the deterministic
// heuristic composer, so the "valid" corpus is valid by construction. Run once:
//   npx tsx eval/_bootstrap.ts
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { ComponentManifest, SignalProfile, GenerationRequest } from "@dynui/contracts";
import { composeHeuristic } from "@dynui/generate";
import { validateTree } from "@dynui/validate";

const root = join(import.meta.dirname, "..");
const rj = (p: string) => JSON.parse(readFileSync(join(root, p), "utf8"));

const manifest = rj("examples/fitness/manifest.example.json") as ComponentManifest;
const data = rj("examples/fitness/sample-activity.json") as Record<string, unknown>;
const perf = rj("tests/fixtures/profiles/valid/performance.json") as SignalProfile;
const noConsent = rj("tests/fixtures/profiles/valid/no-consent.json") as SignalProfile;

const req = (profile: SignalProfile, experiments: any[] = []): GenerationRequest => ({
  surface: "activity-detail",
  profile,
  manifest,
  constraints: manifest.constraints,
  data: data as any,
  experiments,
});

function emit(name: string, r: GenerationRequest) {
  const tree = composeHeuristic(r);
  tree.meta.generatedAt = "2026-06-20T00:00:00.000Z"; // stable for fixtures
  const v = validateTree(tree, manifest);
  if (!v.ok) throw new Error(`${name} is not valid: ${JSON.stringify(v.errors)}`);
  writeFileSync(
    join(root, "tests/fixtures/trees/valid", `${name}.json`),
    JSON.stringify(tree, null, 2) + "\n",
  );
  console.log(`wrote ${name} (${v.ok ? "valid" : "INVALID"})`);
}

emit("flat-performance", req(perf));
emit("experiment-gated", req(perf, [{ experimentId: "exp.strength-volume", variant: "treatment" }]));
emit("no-consent-neutral", req(noConsent));
