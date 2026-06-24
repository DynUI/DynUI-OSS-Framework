/**
 * NO-MODEL, NON-FITNESS demo. Proves the framework personalizes a *news* feed with
 * zero model calls — lint → infer segment → deterministic generation → validate —
 * using only domain artifacts (a manifest + a SignalModel), no core code changes.
 *
 *   npm run demo:no-model
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { JsonValue, SignalModel, SignalProfile, UINode } from "@dynui/contracts";
import { migrateManifest } from "@dynui/contracts";
import { inferSegment } from "@dynui/signal";
import { lintManifest, lintPassed } from "@dynui/figma";
import { generateScreen, HeuristicModelProvider } from "@dynui/generate";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const rj = (p: string) => JSON.parse(readFileSync(join(root, p), "utf8"));

const manifest = migrateManifest(rj("examples/news/manifest.json"));
const data = rj("examples/news/data.json") as Record<string, JsonValue>;
const model = rj("tests/fixtures/domains/news/signal-model.json") as SignalModel;

// Governance gate: the manifest must lint clean before generation.
const lint = lintManifest(manifest);
if (!lintPassed(lint)) throw new Error("news manifest failed lint");

const provider = new HeuristicModelProvider();
const ids = (n: UINode): string[] => {
  const out: string[] = [];
  (function walk(x: UINode) {
    if (x.componentId) out.push(x.componentId);
    (x.children ?? []).forEach(walk);
    Object.values(x.slots ?? {}).flat().forEach(walk);
  })(n);
  return out;
};

const readers: Record<string, Record<string, number>> = {
  reader: { "news.engagement.articles.readRate": 0.8, "news.engagement.headlines.scanRate": 0.2 },
  skimmer: { "news.engagement.headlines.scanRate": 0.7, "news.engagement.articles.readRate": 0.1 },
  commenter: { "news.engagement.social.commentRate": 0.6, "news.engagement.articles.readRate": 0.2 },
};

console.log(`\nNo-model news demo · ${manifest.registry.name} · provider ${provider.id}\n`);
for (const [name, behavior] of Object.entries(readers)) {
  const profile: SignalProfile = {
    schemaVersion: "signal-profile/1.0",
    subject: { anonId: `anon_${name}` },
    consent: { personalization: true, analytics: true, modelTraining: false },
    context: { timestamp: new Date().toISOString(), locale: "en-US", timezone: "America/New_York", surface: "story-feed", device: { platform: "web" }, session: { isNew: false, count: 10 } },
    preferences: {},
    traits: {},
    behavior,
    archetype: inferSegment({ behavior, preferences: {}, traits: {} } as SignalProfile, model),
    cohorts: [],
  };

  const res = await generateScreen(provider, {
    surface: "story-feed",
    profile,
    manifest,
    constraints: manifest.constraints,
    experiments: [],
    data,
  });

  const seg = profile.archetype;
  console.log(`  ${name.padEnd(10)} → segment ${seg?.primary ?? "neutral"} (conf ${seg?.confidence ?? 0}) · valid=${res.validation.ok} · ${ids(res.tree.root).join(", ")}`);
}
console.log();
