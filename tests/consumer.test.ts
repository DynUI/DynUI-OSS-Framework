/**
 * Consumer smoke test: imports the PUBLIC API of every package and walks a realistic
 * adoption flow end-to-end (no model). If an external developer can do this, the
 * packages are wired correctly and the surface is coherent.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { GenerationRequest, JsonValue } from "@dynui/contracts";
import { parseComponentManifest } from "@dynui/contracts";
import { getSignal, inferSegment } from "@dynui/signal";
import { validateTree } from "@dynui/validate";
import { generateScreen, HeuristicModelProvider, buildCacheKey } from "@dynui/generate";
import { ComponentExperimentEngine, InMemoryEventSink } from "@dynui/experiments";
import { BatchingLogger, arraySink, buildExposureEvents, DEFAULT_FITNESS_SIGNAL_MODEL } from "@dynui/telemetry";
import { BaseProfileAdapter, InMemoryProfileStore } from "@dynui/profile";
import { createHmacAnonymizer, minimizeProfileForPrompt, redactError } from "@dynui/privacy";
import { lintManifest, lintPassed } from "@dynui/figma";
import { resolveScreen } from "../apps/fitness-app/src/renderer/resolve";
import type { UITree as AppUITree } from "../apps/fitness-app/src/contract-types";

const root = join(import.meta.dirname, "..");
const rj = (p: string) => JSON.parse(readFileSync(join(root, p), "utf8"));
const data = rj("examples/fitness/sample-activity.json") as Record<string, JsonValue>;

test("an external consumer can import every package and build a personalized screen", async () => {
  // 1) validate a manifest at runtime
  const parsed = parseComponentManifest(rj("examples/fitness/manifest.example.json"));
  assert.ok(parsed.ok, "manifest is schema-valid");
  const manifest = parsed.value;

  // 2) lint it (governance)
  assert.ok(lintPassed(lintManifest(manifest)));

  // 3) resolve a profile via the adapter (with a secret anonymizer)
  const adapter = new BaseProfileAdapter(new InMemoryProfileStore(), {
    anonymize: createHmacAnonymizer("test-secret"),
    signalModel: DEFAULT_FITNESS_SIGNAL_MODEL,
  });
  await adapter.ingestBehavior("real-user", { "fitness.engagement.charts.openRate": 0.9 }, { analyticsConsent: true });
  // Production pattern: pass explicit consent (the adapter denies by default).
  const profile = await adapter.resolveProfile("real-user", {
    surface: "activity-detail",
    consent: { personalization: true, analytics: true, modelTraining: false },
  });
  assert.equal(profile.archetype?.primary, "performance");
  assert.ok(!profile.subject.anonId.includes("real-user"), "anonId is opaque");

  // 4) signal evaluation + segment inference are usable directly
  assert.equal(getSignal(profile, "archetype.primary"), "performance");
  assert.ok(inferSegment(profile, DEFAULT_FITNESS_SIGNAL_MODEL));

  // 5) experiments: stable assignment
  const engine = new ComponentExperimentEngine([], new InMemoryEventSink());
  const assignments = engine.assignmentsFor(profile);
  assert.ok(Array.isArray(assignments));

  // 6) generate a fallback (no-model) screen and validate it
  const req: GenerationRequest = { surface: "activity-detail", profile, manifest, constraints: manifest.constraints, experiments: assignments, data };
  const res = await generateScreen(new HeuristicModelProvider(), req);
  assert.ok(res.validation.ok, "generated screen is valid");
  assert.equal(res.usedFallback, false);
  assert.ok(res.diagnostics.outcome === "first-try");

  // 7) privacy: minimization + redaction
  const minimal = minimizeProfileForPrompt(profile, { requiredSignals: ["archetype.primary"] });
  assert.equal((minimal as unknown as Record<string, unknown>).subject, undefined);
  assert.ok(!redactError(new Error("oops user@x.com")).includes("user@x.com"));

  // 8) cache key is deterministic + PII-free
  const key = buildCacheKey({ manifestVersion: manifest.registry.version, surface: "activity-detail", segment: "performance", experiments: [] });
  assert.ok(!key.includes(profile.subject.anonId));

  // 9) render/resolve the tree
  const sections = resolveScreen(res.tree as unknown as AppUITree, data);
  assert.ok(sections.length > 0 && sections[0].items.length > 0, "tree resolves to render items");

  // 10) telemetry: exposure events delivered to a sink
  const out: unknown[] = [];
  const logger = new BatchingLogger(arraySink(out as never), 1);
  for (const e of buildExposureEvents(sections[0].items.map((i) => ({ componentId: i.componentId })), { anonId: profile.subject.anonId, surface: "activity-detail", generationId: "g1" })) logger.log(e);
  await logger.flush();
  assert.ok(out.length > 0, "exposure events delivered");
});
