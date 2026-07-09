/**
 * The heuristic ceiling — why a model earns its place above the deterministic engine.
 *
 *   npm run demo:ceiling
 *   PROVIDER=anthropic ANTHROPIC_API_KEY=sk-... npm run demo:ceiling   # also run a live model
 *
 * The deterministic engine (`composeHeuristic`) is production-grade: it ranks
 * registered components and lays them out in flat sections. But it has a hard
 * structural ceiling — it **never fills a slot**. It cannot nest one component
 * inside another, so it cannot express *grouping* or *hierarchy*.
 *
 * This vocabulary is built around exactly that: a `readiness-panel` container whose
 * whole value is grouping HRV / strain / sleep (and a load trend) into one coherent
 * card. The deterministic engine can only emit the panel as a hollow frame with the
 * metrics scattered flat beside it. With an LLM composing, they are nested where they
 * belong — a strictly better arrangement the same vocabulary already permits.
 *
 * Everything here is validated against the same safety boundary. No fabrication:
 * the "composed" layout is a real UITree, validated live, that the deterministic
 * engine provably cannot produce.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import type {
  ComponentManifest,
  GenerationRequest,
  JsonValue,
  ModelProvider,
  SignalProfile,
  UINode,
  UITree,
} from "@dynui/contracts";
import {
  generateScreen,
  HeuristicModelProvider,
  AnthropicModelProvider,
} from "@dynui/generate";
import { validateRenderableTree } from "@dynui/validate";

const here = dirname(fileURLToPath(import.meta.url));
const readJson = (p: string) => JSON.parse(readFileSync(join(here, p), "utf8"));

const manifest = readJson("ceiling/manifest.json") as ComponentManifest;
const data = readJson("ceiling/data.json") as Record<string, JsonValue>;
const composed = readJson("ceiling/composed.reference.json") as UITree;

// A plain consented profile. Every component here is audience "*" with no showWhen,
// so nothing depends on the archetype — the ONLY variable on display is composition.
const profiles = readJson("fitness/signal-profile.examples.json") as Record<
  string,
  SignalProfile
>;
const profile = Object.entries(profiles).find(([n]) => !n.startsWith("_"))![1];
profile.subject.anonId = "anon-ceiling";

const SURFACE = "dashboard";

function renderTree(root: UINode, indent = "  "): string {
  const lines: string[] = [];
  const walk = (n: UINode, depth: number) => {
    const pad = indent.repeat(depth);
    if (n.type === "component") {
      const nested = Object.keys(n.slots ?? {}).length > 0;
      lines.push(`${pad}• ${n.componentId} (${n.variant ?? "—"})${nested ? "  ⟨container⟩" : ""}`);
    } else {
      lines.push(`${pad}[${n.label ?? n.type}]`);
    }
    (n.children ?? []).forEach((c) => walk(c, depth + 1));
    for (const [slot, kids] of Object.entries(n.slots ?? {})) {
      lines.push(`${pad}  ↳ slot "${slot}":`);
      kids.forEach((c) => walk(c, depth + 2));
    }
  };
  walk(root, 0);
  return lines.join("\n");
}

function countNested(root: UINode): number {
  let n = 0;
  const walk = (node: UINode) => {
    for (const kids of Object.values(node.slots ?? {})) {
      n += kids.length;
      kids.forEach(walk);
    }
    (node.children ?? []).forEach(walk);
  };
  walk(root);
  return n;
}

async function main() {
  const req: GenerationRequest = {
    surface: SURFACE,
    profile,
    manifest,
    constraints: manifest.constraints,
    experiments: [],
    data,
  };

  // 1) The deterministic engine — ranks and lays out, but never nests.
  const det = await generateScreen(new HeuristicModelProvider(), req);
  console.log(`\n=== 1. Deterministic engine (heuristic) — '${SURFACE}' ===\n`);
  console.log(renderTree(det.tree.root));
  console.log(
    `\n    valid: ${det.validation.ok ? "✓" : "✗"}  |  nested components: ${countNested(det.tree.root)}` +
      `  |  the readiness-panel is a hollow frame; the metrics sit flat beside it.\n`,
  );

  // 2) With an LLM composing — nests the metrics where they belong. Real, validated.
  composed.generatedFor.anonId = profile.subject.anonId;
  const v = validateRenderableTree(composed, manifest, {
    surface: SURFACE,
    profile,
    data,
    experiments: [],
  });
  console.log(`=== 2. With LLM composing (what a model produces) ===\n`);
  console.log(renderTree(composed.root));
  console.log(
    `\n    valid: ${v.ok ? "✓" : "✗ " + v.errors.map((e) => e.message).join("; ")}` +
      `  |  nested components: ${countNested(composed.root)}` +
      `  |  one coherent panel; the same vocabulary, arranged as designed.\n`,
  );

  // 3) Optional: prove it end-to-end on a live model.
  if (process.env.PROVIDER === "anthropic") {
    const provider: ModelProvider = new AnthropicModelProvider();
    const live = await generateScreen(provider, req, { timeoutMs: 30_000 });
    console.log(`=== 3. Live model (${provider.id}) ===\n`);
    console.log(renderTree(live.tree.root));
    console.log(
      `\n    valid: ${live.validation.ok ? "✓" : "✗"}  |  nested: ${countNested(live.tree.root)}` +
        `  |  outcome: ${live.diagnostics?.outcome}${live.usedFallback ? " (fell back to heuristic)" : ""}\n`,
    );
  }

  console.log("─".repeat(72));
  console.log(
    "Takeaway: the deterministic engine can only sort registered components into\n" +
      "flat sections — it never fills a slot, so grouping and hierarchy are outside\n" +
      "its reach. Composing them into a coherent panel is what a model adds, still\n" +
      "bounded to your vocabulary and still passed through the same validator.\n" +
      "The heuristic remains the instant, free, request-time-safe floor; the model\n" +
      "raises the ceiling where composition — not just ranking — is the point.\n",
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
