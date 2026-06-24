/**
 * Build step: run the generation engine over the fitness manifest + the 3
 * archetype profiles and write the validated UITrees to a JSON file the app reads.
 *
 *   npm run gen:screens
 *
 * This keeps the app a pure renderer (server-driven UI): it consumes generated
 * trees, it does not run generation itself.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type {
  GenerationRequest,
  JsonValue,
  SignalProfile,
  UITree,
} from "@dynui/contracts";
import { migrateManifest, parseSignalProfile, formatIssues } from "@dynui/contracts";
import { generateScreen, HeuristicModelProvider } from "@dynui/generate";
import { lintManifest, lintPassed } from "@dynui/figma";
import {
  checkRendererCompat,
  rendererSpecs,
} from "../apps/fitness-app/src/renderer/registry-contract.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const readJson = (p: string) => JSON.parse(readFileSync(join(root, p), "utf8"));

// Public JSON entry points parse through the runtime schemas before any logic.
const manifest = migrateManifest(readJson("examples/fitness/manifest.example.json"));

// Governance gate: a manifest must lint clean (no errors) before generation.
const lint = lintManifest(manifest);
if (!lintPassed(lint)) {
  throw new Error(
    `Manifest failed lint — cannot emit screens:\n${lint
      .filter((i) => i.severity === "error")
      .map((i) => `  [${i.code}] ${i.componentId}: ${i.message}`)
      .join("\n")}`,
  );
}

// Phase gate: the app must be able to RENDER what we hand it. Refuse to emit
// screens for a manifest the renderer registry can't fully support.
const compat = checkRendererCompat(manifest, rendererSpecs);
if (compat.length) {
  throw new Error(
    `Renderer incompatible with manifest — cannot emit screens:\n${compat
      .map((i) => `  [${i.code}] ${i.componentId}: ${i.message}`)
      .join("\n")}`,
  );
}
const profiles = Object.fromEntries(
  Object.entries(
    readJson("examples/fitness/signal-profile.examples.json") as Record<string, unknown>,
  )
    .filter(([name]) => !name.startsWith("_"))
    .map(([name, raw]) => {
      const r = parseSignalProfile(raw);
      if (!r.ok) throw new Error(`Invalid profile '${name}':\n${formatIssues(r.issues)}`);
      return [name, r.value];
    }),
) as Record<string, SignalProfile>;
const data = readJson("examples/fitness/sample-activity.json") as Record<string, JsonValue>;

const SURFACE = "activity-detail";
const provider = new HeuristicModelProvider();

const screens: Record<string, UITree> = {};

for (const [name, profile] of Object.entries(profiles)) {
  if (name.startsWith("_")) continue;
  const req: GenerationRequest = {
    surface: SURFACE,
    profile,
    manifest,
    constraints: manifest.constraints,
    experiments: [],
    data,
  };
  const { tree, validation } = await generateScreen(provider, req);
  if (!validation.ok) {
    throw new Error(
      `Generated screen for '${name}' is invalid: ${validation.errors.map((e) => e.message).join("; ")}`,
    );
  }
  screens[name] = tree;
}

// Also emit the performance athlete's screen WITH the canaried component enabled,
// so the app can show the experiment's treatment side by side with the control.
const { tree: canaryTree, validation: canaryValid } = await generateScreen(provider, {
  surface: SURFACE,
  profile: profiles.performanceAthlete,
  manifest,
  constraints: manifest.constraints,
  experiments: [{ experimentId: "exp.strength-volume", variant: "treatment" }],
  data,
});
if (!canaryValid.ok) {
  throw new Error(
    `Canary screen invalid: ${canaryValid.errors.map((e) => e.message).join("; ")}`,
  );
}
screens.performanceCanary = canaryTree;

// A neutral "new user" screen: no archetype, no behavior yet (cold start).
const coldProfile = structuredClone(profiles.performanceAthlete);
coldProfile.subject.anonId = "new-user";
coldProfile.behavior = {};
coldProfile.preferences = {};
coldProfile.archetype = undefined;
const { tree: defaultTree, validation: defaultValid } = await generateScreen(provider, {
  surface: SURFACE,
  profile: coldProfile,
  manifest,
  constraints: manifest.constraints,
  experiments: [],
  data,
});
if (!defaultValid.ok) {
  throw new Error(`Default screen invalid: ${defaultValid.errors.map((e) => e.message).join("; ")}`);
}
screens.default = defaultTree;

// Component → engagement-signal map, so the app can attribute taps to signals.
const signalMap = Object.fromEntries(
  manifest.components
    .filter((c) => c.engagementSignal)
    .map((c) => [c.id, c.engagementSignal as string]),
);

const outPath = join(root, "apps/fitness-app/assets/screens.json");
mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(
  outPath,
  JSON.stringify({ surface: SURFACE, data, screens, signalMap }, null, 2),
);

console.log(
  `Wrote ${Object.keys(screens).length} screens → apps/fitness-app/assets/screens.json`,
);
