// Minimal adoption flow, run INSIDE a clean consumer project against the PACKED
// tarballs (not the monorepo source). It exercises every public package the way an
// external adopter would, with no model key and no provider SDK.
//
// Fixtures (manifest/profile/data) are copied next to this file by the orchestrator.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { parseComponentManifest, parseSignalProfile } from "@dynui/contracts";
import { getSignal, inferSegment } from "@dynui/signal";
import { validateRenderableTree, validateTreeStructure } from "@dynui/validate";
import {
  generateScreen,
  HeuristicModelProvider,
  buildCacheKey,
  cacheContextFromProfile,
} from "@dynui/generate";
import { ComponentExperimentEngine, InMemoryEventSink } from "@dynui/experiments";
import { aggregateBehavior, DEFAULT_FITNESS_SIGNAL_MODEL } from "@dynui/telemetry";
import { BaseProfileAdapter, InMemoryProfileStore, DENY_ALL_CONSENT } from "@dynui/profile";
import { minimizeProfileForPrompt, createHmacAnonymizer } from "@dynui/privacy";
import { lintManifest, lintPassed } from "@dynui/figma";

const here = dirname(fileURLToPath(import.meta.url));
const rj = (p) => JSON.parse(readFileSync(join(here, p), "utf8"));

let step = 0;
const ok = (msg) => console.log(`  ✓ [${++step}] ${msg}`);
function assert(cond, msg) {
  if (!cond) throw new Error(`SMOKE FAILED: ${msg}`);
}

// Sanity: every public package imported above resolved from its packed dist.
ok("imported all public @dynui/* packages from packed tarballs");

// 1) parse a manifest (runtime schema + version checks)
const parsedManifest = parseComponentManifest(rj("manifest.json"));
assert(parsedManifest.ok, "manifest parses and is schema-valid");
const manifest = parsedManifest.value;
ok("parsed a component manifest");

// 2) lint a manifest (governance)
assert(lintPassed(lintManifest(manifest)), "manifest passes governance lint");
ok("linted a manifest");

// 3) parse a profile
const profiles = rj("profiles.json");
const parsedProfile = parseSignalProfile(profiles.performanceAthlete);
assert(parsedProfile.ok, "profile parses and is schema-valid");
const profile = parsedProfile.value;
ok("parsed a signal profile");

// 4) signal evaluation + segment inference
assert(getSignal(profile, "archetype.primary") === "performance", "signal path resolves");
assert(inferSegment(profile, DEFAULT_FITNESS_SIGNAL_MODEL), "segment inference returns a result");
ok("evaluated signals + inferred a segment");

// 5) experiments: stable assignment
const engine = new ComponentExperimentEngine([], new InMemoryEventSink());
const experiments = engine.assignmentsFor(profile);
assert(Array.isArray(experiments), "assignmentsFor returns an array");
ok("computed experiment assignments");

// 6) generate a deterministic screen (no model key)
const data = rj("data.json");
const req = { surface: "activity-detail", profile, manifest, constraints: manifest.constraints, experiments, data };
const res = await generateScreen(new HeuristicModelProvider(), req);
assert(res.validation.ok, "generated screen is valid");
assert(res.usedFallback === false, "deterministic generation did not need fallback");
ok("generated a deterministic screen");

// 7) validate with the full render context (the render gate)
const v = validateRenderableTree(res.tree, manifest, { surface: "activity-detail", profile, data, experiments });
assert(v.ok, "render gate passes for the generated tree");
assert(validateTreeStructure(res.tree, manifest).ok, "structural validation passes too");
ok("validated the tree with full context");

// 8) build a (PII-free) cache key
const key = buildCacheKey({
  manifestVersion: manifest.registry.version,
  surface: "activity-detail",
  segment: profile.archetype?.primary ?? "neutral",
  experiments,
  context: cacheContextFromProfile(profile),
});
assert(typeof key === "string" && key.length > 0, "cache key built");
assert(!key.includes(profile.subject.anonId), "cache key carries no identifier");
ok("built a PII-free cache key");

// 9) minimize a profile for prompt use (no ids / raw behavior / sensitive fields)
const minimal = minimizeProfileForPrompt(profile, manifest);
assert(!JSON.stringify(minimal).includes(profile.subject.anonId), "minimized profile has no anonId");
ok("minimized a profile for prompt use");

// 10) the profile adapter is deny-by-default (production-safe)
const adapter = new BaseProfileAdapter(new InMemoryProfileStore(), { anonymize: createHmacAnonymizer("smoke-secret") });
const neutral = await adapter.resolveProfile("real-user", { surface: "activity-detail" });
assert(neutral.consent.personalization === DENY_ALL_CONSENT.personalization && neutral.consent.personalization === false, "adapter denies personalization by default");
ok("profile adapter denies consent by default");

// 11) aggregate behavior (telemetry) is callable
const signals = aggregateBehavior([], manifest);
assert(signals && typeof signals === "object", "aggregateBehavior returns a signal map");
ok("aggregated behavior events");

console.log("\nSMOKE OK — packed packages work in a clean consumer project.\n");
