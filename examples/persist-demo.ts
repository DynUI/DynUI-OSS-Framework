/**
 * Cross-session persistence: behavior captured in one session is written through
 * the Profile Adapter, and a BRAND-NEW adapter instance (simulating an app
 * relaunch / server restart) resolves the same user and sees it — so the UI stays
 * adapted across sessions, not just within one.
 *
 *   npm run demo:persist
 */
import { existsSync, rmSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { ComponentManifest, JsonValue, SignalProfile, UINode } from "@dynui/contracts";
import { generateScreen, HeuristicModelProvider } from "@dynui/generate";
import { aggregateBehavior, BatchingLogger, arraySink, type BehaviorEvent } from "@dynui/telemetry";
import { BaseProfileAdapter, DEV_DEFAULT_CONSENT, FileProfileStore } from "@dynui/profile";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const readJson = (p: string) => JSON.parse(readFileSync(join(root, p), "utf8"));
const manifest = readJson("examples/fitness/manifest.example.json") as ComponentManifest;
const data = readJson("examples/fitness/sample-activity.json") as Record<string, JsonValue>;

const SURFACE = "activity-detail";
const USER = "alex@example.com";
const STORE_PATH = join(root, "examples/.data/profiles.json");
const provider = new HeuristicModelProvider();

if (existsSync(STORE_PATH)) rmSync(STORE_PATH); // start clean

const ids = (tree: { root: UINode }): string[] => {
  const out: string[] = [];
  (function walk(n: UINode) {
    if (n.componentId) out.push(n.componentId);
    (n.children ?? []).forEach(walk);
    Object.values(n.slots ?? {}).flat().forEach(walk);
  })(tree.root);
  return out;
};

const gen = (profile: SignalProfile) =>
  generateScreen(provider, {
    surface: SURFACE,
    profile,
    manifest,
    constraints: manifest.constraints,
    experiments: [],
    data,
  });

// A session of heavy data-card engagement, aggregated to behavior signals.
function sessionDelta(): Record<string, number> {
  const events: BehaviorEvent[] = [];
  const logger = new BatchingLogger(arraySink(events), 1000);
  const plan: Record<string, [number, number]> = {
    "training-load-chart": [8, 7],
    "hr-zone-breakdown": [8, 6],
    "split-table": [8, 6],
    "insight-card": [8, 1],
  };
  for (const [id, [shown, tapped]] of Object.entries(plan)) {
    for (let i = 0; i < shown; i++) logger.log({ type: "exposure", anonId: "x", surface: SURFACE, componentId: id });
    for (let i = 0; i < tapped; i++) logger.log({ type: "tap", anonId: "x", surface: SURFACE, componentId: id });
  }
  void logger.flush();
  return aggregateBehavior(events, manifest);
}

// ---- Session 1: a fresh user ----------------------------------------------
// Demo-only: opt into permissive consent explicitly. The adapter default is
// deny-by-default (DENY_ALL_CONSENT); production code passes real per-user consent.
const adapterA = new BaseProfileAdapter(new FileProfileStore(STORE_PATH), {
  defaultConsent: DEV_DEFAULT_CONSENT,
});
const p1 = await adapterA.resolveProfile(USER, { surface: SURFACE });
const s1 = await gen(p1);
console.log("\n=== Session 1 (new user) ===");
console.log(`  session #${p1.context.session.count} (isNew=${p1.context.session.isNew})`);
console.log(`  archetype: ${p1.archetype?.primary ?? "(none)"}`);
console.log(`  screen: ${ids(s1.tree).join(", ")}`);

await adapterA.ingestBehavior(USER, sessionDelta());
console.log("  → behavior persisted to disk");

// ---- Session 2: a BRAND-NEW adapter (relaunch), same store ----------------
const adapterB = new BaseProfileAdapter(new FileProfileStore(STORE_PATH), {
  defaultConsent: DEV_DEFAULT_CONSENT,
});
const p2 = await adapterB.resolveProfile(USER, { surface: SURFACE });
const s2 = await gen(p2);
console.log("\n=== Session 2 (new adapter instance — simulates app relaunch) ===");
console.log(`  session #${p2.context.session.count} (isNew=${p2.context.session.isNew})`);
console.log(
  `  archetype: ${p2.archetype ? `${p2.archetype.primary} (conf ${p2.archetype.confidence})` : "(none)"}`,
);
console.log(`  screen: ${ids(s2.tree).join(", ")}`);

console.log("\n=== Persisted on disk (no PII — anonId + signals) ===");
console.log(readFileSync(STORE_PATH, "utf8"));
console.log("Session 2 had no in-memory state — it read everything from the store.\n");
