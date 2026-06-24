/**
 * End-to-end Phase-1 demo: same activity, three users → three generated screens.
 *
 *   npm run demo              # deterministic heuristic engine (no API key)
 *   PROVIDER=anthropic ANTHROPIC_API_KEY=sk-... npm run demo   # real LLM generation
 *
 * Either way the output is validated against the manifest, with a deterministic
 * fallback if generation/validation fails.
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
} from "@dynui/contracts";
import {
  generateScreen,
  HeuristicModelProvider,
  AnthropicModelProvider,
} from "@dynui/generate";

const here = dirname(fileURLToPath(import.meta.url));
const readJson = (p: string) => JSON.parse(readFileSync(join(here, p), "utf8"));

const manifest = readJson("fitness/manifest.example.json") as ComponentManifest;
const profiles = readJson("fitness/signal-profile.examples.json") as Record<
  string,
  SignalProfile
>;

// One activity's worth of resolved data — the keys components bind to.
const data = readJson("fitness/sample-activity.json") as Record<string, JsonValue>;

const provider: ModelProvider =
  process.env.PROVIDER === "anthropic"
    ? new AnthropicModelProvider()
    : new HeuristicModelProvider();

const SURFACE = "activity-detail";

function renderTree(root: UINode, indent = "  "): string {
  const lines: string[] = [];
  const walk = (n: UINode, depth: number) => {
    const pad = indent.repeat(depth);
    if (n.type === "component") {
      lines.push(`${pad}• ${n.componentId} (${n.variant ?? "—"})`);
      if (n.reason) lines.push(`${pad}    ↳ ${n.reason}`);
    } else {
      lines.push(`${pad}[${n.label ?? n.type}]`);
    }
    (n.children ?? []).forEach((c) => walk(c, depth + 1));
    Object.values(n.slots ?? {})
      .flat()
      .forEach((c) => walk(c, depth + 1));
  };
  walk(root, 0);
  return lines.join("\n");
}

async function main() {
  console.log(
    `\n=== DynUI — generating '${SURFACE}' via ${provider.id} ===\n`,
  );

  for (const [name, profile] of Object.entries(profiles)) {
    if (name.startsWith("_")) continue;
    const req: GenerationRequest = {
      surface: SURFACE,
      profile,
      manifest,
      constraints: manifest.constraints,
      experiments: profile.cohorts?.length
        ? [{ experimentId: "training-load-widget", variant: "control" }]
        : [],
      data,
    };

    const { tree, validation, usedFallback } = await generateScreen(provider, req);

    console.log(
      `──── ${name}  (archetype: ${profile.archetype?.primary ?? "?"}) ────`,
    );
    console.log(renderTree(tree.root));
    console.log(
      `    valid: ${validation.ok ? "✓" : "✗ " + validation.errors.map((e) => e.message).join("; ")}` +
        `  |  model: ${tree.meta.model}${usedFallback ? "  (FALLBACK)" : ""}\n`,
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
