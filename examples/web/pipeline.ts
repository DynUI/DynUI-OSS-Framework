/**
 * Deterministic generation pipeline for the browser example.
 *
 * This is the *same* no-model path the framework uses everywhere else
 * (lint → infer segment → deterministic generation → validate), factored into a
 * pure function so both the local HTTP server (`server.ts`) and the smoke test
 * can call it. It reuses the real @dynui packages and the real fitness domain
 * artifacts — nothing here re-implements framework logic, and no model
 * credentials are involved.
 *
 * Domain: the fitness pack — one morning run, composed very differently for a
 * performance-, wellness-, or social-oriented athlete.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type {
  ComponentManifest,
  JsonValue,
  SignalModel,
  SignalProfile,
} from "@dynui/contracts";
import { migrateManifest } from "@dynui/contracts";
import { inferSegment } from "@dynui/signal";
import { lintManifest, lintPassed } from "@dynui/figma";
import {
  generateScreen,
  HeuristicModelProvider,
  type ScreenResult,
} from "@dynui/generate";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const rj = (p: string) => JSON.parse(readFileSync(join(repoRoot, p), "utf8"));

// Domain artifacts — a registered component vocabulary, a signal model, and one
// activity's worth of data. These are ordinary repository files; edit them and
// the generated UI changes.
const baseManifest = migrateManifest(
  rj("examples/fitness/manifest.example.json") as Record<string, JsonValue>,
);
const data = rj("examples/fitness/sample-activity.json") as Record<
  string,
  JsonValue
>;
const model = rj("examples/fitness/signal-model.json") as SignalModel;

// Governance gate: refuse to run if the manifest does not lint clean.
{
  const lint = lintManifest(baseManifest);
  if (!lintPassed(lint)) {
    throw new Error(
      `fitness manifest failed lint: ${lint.map((i) => i.message).join("; ")}`,
    );
  }
}

const provider = new HeuristicModelProvider();
const SURFACE = "activity-detail";

/** The three behavioural signals a profile can carry, for the UI sliders. */
export const SIGNALS = [
  {
    key: "fitness.engagement.charts.openRate",
    label: "Opens charts & data",
    hint: "Studies the numbers → leans performance",
  },
  {
    key: "fitness.engagement.insights.readRate",
    label: "Reads insights",
    hint: "Wants the takeaway → leans wellness",
  },
  {
    key: "fitness.engagement.social.kudosRate",
    label: "Gives kudos",
    hint: "Engages with people → leans social",
  },
] as const;

/** Preset profiles shipped with the example (fictional, non-sensitive). */
export const PRESETS: Record<string, Record<string, number>> = {
  performance: {
    "fitness.engagement.charts.openRate": 0.8,
    "fitness.engagement.insights.readRate": 0.35,
    "fitness.engagement.social.kudosRate": 0.2,
  },
  wellness: {
    "fitness.engagement.charts.openRate": 0.2,
    "fitness.engagement.insights.readRate": 0.8,
    "fitness.engagement.social.kudosRate": 0.2,
  },
  social: {
    "fitness.engagement.charts.openRate": 0.25,
    "fitness.engagement.insights.readRate": 0.35,
    "fitness.engagement.social.kudosRate": 0.8,
  },
};

export interface GenerateInput {
  /** behaviour signal → value in [0, 1] */
  behavior: Record<string, number>;
  /** consent flag; when false, personalisation is withheld (neutral screen) */
  personalization: boolean;
  /** optional component priority overrides (componentId → priority) */
  priorityOverrides?: Record<string, number>;
}

export interface GenerateResult {
  manifestName: string;
  surface: string;
  segment: { primary?: string; secondary?: string; confidence: number };
  validation: ScreenResult["validation"];
  tree: ScreenResult["tree"];
  diagnostics: ScreenResult["diagnostics"];
  /** the data bundle the renderer resolves bindings against */
  data: Record<string, JsonValue>;
  /** lightweight component summary for the priority editor */
  components: {
    id: string;
    name: string;
    category: string;
    priority: number;
  }[];
}

/** Apply UI-supplied priority overrides to a fresh copy of the manifest. */
function withOverrides(overrides?: Record<string, number>): ComponentManifest {
  if (!overrides || Object.keys(overrides).length === 0) return baseManifest;
  const next = structuredClone(baseManifest);
  for (const c of next.components) {
    const p = overrides[c.id];
    if (typeof p === "number" && Number.isFinite(p)) {
      c.contract.priority = p;
    }
  }
  return next;
}

/** Run the full deterministic pipeline for one set of edits. */
export async function buildScreen(
  input: GenerateInput,
): Promise<GenerateResult> {
  const manifest = withOverrides(input.priorityOverrides);
  const behavior = input.behavior;

  const segment = inferSegment(
    { behavior, preferences: {}, traits: {} } as SignalProfile,
    model,
  );

  const profile: SignalProfile = {
    schemaVersion: "signal-profile/1.0",
    subject: { anonId: "anon_example" },
    consent: {
      personalization: input.personalization,
      analytics: true,
      modelTraining: false,
    },
    context: {
      timestamp: new Date().toISOString(),
      locale: "en-GB",
      timezone: "Europe/London",
      surface: SURFACE,
      device: { platform: "web" },
      session: { isNew: false, count: 42 },
    },
    preferences: {},
    traits: {},
    behavior,
    archetype: segment,
    cohorts: [],
  };

  const res = await generateScreen(provider, {
    surface: SURFACE,
    profile,
    manifest,
    constraints: manifest.constraints,
    experiments: [],
    data,
  });

  return {
    manifestName: manifest.registry.name,
    surface: SURFACE,
    segment: {
      primary: segment?.primary,
      secondary: segment?.secondary,
      confidence: segment?.confidence ?? 0,
    },
    validation: res.validation,
    tree: res.tree,
    diagnostics: res.diagnostics,
    data,
    components: manifest.components.map((c) => ({
      id: c.id,
      name: c.name,
      category: c.category,
      priority: c.contract.priority ?? 0,
    })),
  };
}
