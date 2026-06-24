import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ComponentManifest, GenerationRequest, JsonValue } from "@dynui/contracts";
import {
  anonIdFor,
  BaseProfileAdapter,
  InMemoryProfileStore,
  FileProfileStore,
  DENY_ALL_CONSENT,
  DEV_DEFAULT_CONSENT,
} from "@dynui/profile";
import { composeHeuristic } from "@dynui/generate";

const root = join(import.meta.dirname, "..");
const rj = (p: string) => JSON.parse(readFileSync(join(root, p), "utf8"));

test("anonId is stable, distinct, and contains no PII", () => {
  assert.equal(anonIdFor("alex@example.com"), anonIdFor("alex@example.com"));
  assert.notEqual(anonIdFor("a@x.com"), anonIdFor("b@x.com"));
  assert.ok(!anonIdFor("alex@example.com").includes("alex"));
});

test("resolve bumps the session; ingest then resolve infers the archetype (with consent)", async () => {
  // Permissive consent must be opted into explicitly — the adapter default denies.
  const a = new BaseProfileAdapter(new InMemoryProfileStore(), {
    defaultConsent: DEV_DEFAULT_CONSENT,
  });
  const p1 = await a.resolveProfile("u", { surface: "activity-detail" });
  assert.equal(p1.context.session.isNew, true);
  assert.equal(p1.archetype, undefined);

  await a.ingestBehavior("u", { "fitness.engagement.charts.openRate": 0.8 });
  const p2 = await a.resolveProfile("u", { surface: "activity-detail" });
  assert.equal(p2.context.session.isNew, false);
  assert.equal(p2.context.session.count, 2);
  assert.equal(p2.archetype?.primary, "performance");
});

// --- safe-by-default consent (Phase 1) -------------------------------------

test("a fresh adapter denies consent by default (production-safe)", async () => {
  const a = new BaseProfileAdapter(new InMemoryProfileStore());
  // No configured consent: the user is treated as non-consenting.
  await a.ingestBehavior("u", { "fitness.engagement.charts.openRate": 0.95 }); // must be ignored
  const p = await a.resolveProfile("u", { surface: "activity-detail" });
  assert.equal(p.consent.personalization, false, "deny-by-default personalization");
  assert.equal(p.consent.analytics, false, "deny-by-default analytics");
  assert.equal(p.consent.modelTraining, false, "deny-by-default modelTraining");
  assert.equal(p.archetype, undefined, "no personalization => neutral, no archetype");
  assert.deepEqual(p.behavior, {}, "no analytics => no behavior was ingested");
});

test("the deny-all default and the opt-in demo consent are exactly as expected", () => {
  assert.deepEqual(DENY_ALL_CONSENT, { personalization: false, analytics: false, modelTraining: false });
  assert.deepEqual(DEV_DEFAULT_CONSENT, { personalization: true, analytics: true, modelTraining: false });
});

test("stored personalization:false resolves onto the profile (and neutralizes the archetype)", async () => {
  const a = new BaseProfileAdapter(new InMemoryProfileStore());
  await a.ingestBehavior("u", { "fitness.engagement.charts.openRate": 0.9 }); // would infer performance
  await a.setConsent("u", { personalization: false, analytics: true, modelTraining: false });
  const p = await a.resolveProfile("u", { surface: "activity-detail" });
  assert.equal(p.consent.personalization, false, "stored consent resolves onto the profile");
  assert.equal(p.archetype, undefined, "no personalization => neutral, no archetype");
});

test("stored analytics:false resolves onto the profile", async () => {
  const a = new BaseProfileAdapter(new InMemoryProfileStore());
  await a.setConsent("u", { personalization: true, analytics: false, modelTraining: false });
  const p = await a.resolveProfile("u", { surface: "activity-detail" });
  assert.equal(p.consent.analytics, false);
});

test("modelTraining stays false unless explicitly set true", async () => {
  const a = new BaseProfileAdapter(new InMemoryProfileStore());
  const def = await a.resolveProfile("d", { surface: "s" });
  assert.equal(def.consent.modelTraining, false, "default keeps training opt-in");
  await a.setConsent("u", { personalization: true, analytics: true, modelTraining: true });
  const p = await a.resolveProfile("u", { surface: "s" });
  assert.equal(p.consent.modelTraining, true, "honored only when explicitly set");
});

test("ingestBehavior no-ops when stored analytics consent is false (no opts arg needed)", async () => {
  const a = new BaseProfileAdapter(new InMemoryProfileStore());
  await a.setConsent("u", { personalization: true, analytics: false, modelTraining: false });
  await a.ingestBehavior("u", { "fitness.engagement.charts.openRate": 0.9 }); // no opts: must read stored consent
  const p = await a.resolveProfile("u", { surface: "s" });
  assert.deepEqual(p.behavior, {}, "stored analytics:false blocks ingestion without an explicit opts flag");
});

test("changing consent from true to false stops future ingestion", async () => {
  const a = new BaseProfileAdapter(new InMemoryProfileStore());
  await a.setConsent("u", { personalization: true, analytics: true, modelTraining: false });
  await a.ingestBehavior("u", { "fitness.engagement.charts.openRate": 0.5 });
  const before = await a.resolveProfile("u", { surface: "s" });
  assert.ok((before.behavior["fitness.engagement.charts.openRate"] ?? 0) > 0, "ingested while consenting");

  await a.setConsent("u", { personalization: true, analytics: false, modelTraining: false });
  await a.ingestBehavior("u", { "fitness.engagement.charts.openRate": 1 }); // must be ignored now
  const after = await a.resolveProfile("u", { surface: "s" });
  assert.equal(
    after.behavior["fitness.engagement.charts.openRate"],
    before.behavior["fitness.engagement.charts.openRate"],
    "no further ingestion after consent is revoked",
  );
});

test("request-time consent via ResolveContext takes precedence and is persisted", async () => {
  const a = new BaseProfileAdapter(new InMemoryProfileStore());
  const p = await a.resolveProfile("u", { surface: "s", consent: { personalization: false, analytics: false, modelTraining: false } });
  assert.equal(p.consent.personalization, false);
  // Persisted: a later ingest with no opts honors the request-time consent.
  await a.ingestBehavior("u", { "fitness.engagement.charts.openRate": 0.9 });
  const p2 = await a.resolveProfile("u", { surface: "s" });
  assert.deepEqual(p2.behavior, {}, "request-time analytics:false persisted and blocks ingestion");
});

test("a no-consent resolved profile composes a neutral screen", async () => {
  const manifest = rj("examples/fitness/manifest.example.json") as ComponentManifest;
  const data = rj("examples/fitness/sample-activity.json") as Record<string, JsonValue>;
  const a = new BaseProfileAdapter(new InMemoryProfileStore());
  await a.ingestBehavior("u", { "fitness.engagement.charts.openRate": 0.95 }); // would skew performance
  await a.setConsent("u", { personalization: false, analytics: true, modelTraining: false });
  const profile = await a.resolveProfile("u", { surface: "activity-detail" });

  const req: GenerationRequest = {
    surface: "activity-detail",
    profile,
    manifest,
    constraints: manifest.constraints,
    experiments: [],
    data,
  };
  const tree = composeHeuristic(req);
  // Neutral: the screen carries no archetype-targeted segment.
  assert.equal(tree.generatedFor.archetype, undefined, "no archetype stamped on a no-consent screen");
});

test("file store persists across separate adapter instances; no PII on disk", async () => {
  const path = join(mkdtempSync(join(tmpdir(), "dynui-")), "profiles.json");
  const a = new BaseProfileAdapter(new FileProfileStore(path), { defaultConsent: DEV_DEFAULT_CONSENT });
  await a.resolveProfile("alex@example.com", { surface: "s" });
  await a.ingestBehavior("alex@example.com", { "fitness.engagement.social.kudosRate": 0.9 });

  const b = new BaseProfileAdapter(new FileProfileStore(path), { defaultConsent: DEV_DEFAULT_CONSENT }); // fresh instance, same file
  const p = await b.resolveProfile("alex@example.com", { surface: "s" });
  assert.equal(p.archetype?.primary, "social");
  assert.ok(!readFileSync(path, "utf8").includes("alex"));
});
