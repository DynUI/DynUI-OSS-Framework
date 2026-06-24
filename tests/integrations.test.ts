import test from "node:test";
import assert from "node:assert/strict";
import type { ExperimentDef } from "@dynui/experiments";
import { ComponentExperimentEngine } from "@dynui/experiments";
import { createHmacAnonymizer } from "@dynui/privacy";
import type { SignalProfile } from "@dynui/contracts";

import {
  GrowthBookAssignmentAdapter,
  type FeatureClient,
} from "../examples/integrations/growthbook-assignment";
import {
  HttpProfileAdapter,
  type HttpClient,
  type RemoteProfile,
} from "../examples/integrations/http-profile-adapter";
import {
  WarehouseTelemetrySink,
  type AnalyticsDestination,
} from "../examples/integrations/warehouse-telemetry-sink";

function profile(over: Partial<SignalProfile> = {}): SignalProfile {
  return {
    schemaVersion: "signal-profile/1.0",
    subject: { anonId: "anon_abc" },
    consent: { personalization: true, analytics: true, modelTraining: false },
    context: { timestamp: "t", locale: "en-US", timezone: "UTC", surface: "story-feed", device: { platform: "web" }, session: { isNew: false, count: 2 } },
    preferences: {},
    traits: {},
    behavior: {},
    archetype: { primary: "reader", confidence: 0.9 },
    cohorts: [],
    ...over,
  } as SignalProfile;
}

const exp: ExperimentDef = {
  id: "exp.headline",
  description: "headline variant test",
  segment: [],
  allocation: 1,
  variants: [{ id: "control", weight: 1 }, { id: "treatment", weight: 1 }],
  goal: "tap",
};

// --- assignment adapter (GrowthBook-style) ---------------------------------

test("assignment adapter defers to the external client and only sends anon attributes", () => {
  const seen: Record<string, unknown>[] = [];
  const client: FeatureClient = {
    evaluate: (_key, attrs) => { seen.push(attrs); return "treatment"; },
  };
  const adapter = new GrowthBookAssignmentAdapter(client);
  const variant = adapter.assign(exp, profile());
  assert.equal(variant, "treatment", "adapter returns the vendor's variant");
  assert.equal(seen.length, 1);
  assert.equal(seen[0].id, "anon_abc", "buckets on the anon id");
  assert.equal(seen[0].segment, "reader");
  // No PII forwarded.
  assert.ok(!("userId" in seen[0]) && !("email" in seen[0]));
});

test("assignment adapter ignores a variant the experiment does not declare", () => {
  const client: FeatureClient = { evaluate: () => "ghost-variant" };
  const adapter = new GrowthBookAssignmentAdapter(client);
  assert.equal(adapter.assign(exp, profile()), null);
});

// --- HTTP profile adapter --------------------------------------------------

function mockHttp(initial: RemoteProfile | null): HttpClient & { puts: Record<string, number>[] } {
  let stored = initial;
  const puts: Record<string, number>[] = [];
  return {
    puts,
    async getProfile() { return stored; },
    async putBehavior(_id, delta) {
      puts.push(delta);
      stored = { behavior: { ...(stored?.behavior ?? {}), ...delta }, consent: stored?.consent };
    },
  };
}

const anonymize = createHmacAnonymizer("test-secret");
const inferArchetype = (b: Record<string, number>): SignalProfile["archetype"] =>
  (b["news.engagement.articles.readRate"] ?? 0) > 0.5 ? { primary: "reader", confidence: 0.8 } : undefined;

test("HTTP profile adapter resolves an anonymous profile and infers archetype with consent", async () => {
  const http = mockHttp({
    behavior: { "news.engagement.articles.readRate": 0.9 },
    consent: { personalization: true, analytics: true, modelTraining: false },
  });
  const adapter = new HttpProfileAdapter(http, { anonymize, inferArchetype });
  const p = await adapter.resolveProfile("real-user@example.com", { surface: "story-feed" });
  assert.ok(!p.subject.anonId.includes("real-user"), "id is anonymized");
  assert.equal(p.archetype?.primary, "reader");
});

test("HTTP profile adapter is deny-by-default and gates archetype + ingestion", async () => {
  const http = mockHttp(null); // unknown user, no stored consent
  const adapter = new HttpProfileAdapter(http, { anonymize, inferArchetype });

  const p = await adapter.resolveProfile("new-user", { surface: "story-feed" });
  assert.equal(p.consent.personalization, false, "deny-by-default personalization");
  assert.equal(p.archetype, undefined, "no archetype without personalization consent");

  // Ingestion is a no-op without analytics consent (stored consent denies).
  await adapter.ingestBehavior("new-user", { "news.engagement.articles.readRate": 1 });
  assert.equal(http.puts.length, 0, "no behavior written without analytics consent");

  // With explicit consent it writes.
  await adapter.ingestBehavior("new-user", { "news.engagement.articles.readRate": 1 }, { analyticsConsent: true });
  assert.equal(http.puts.length, 1, "writes when consent is explicit");
});

// --- warehouse / Segment telemetry sink ------------------------------------

test("warehouse sink forwards events with no PII and keeps analysis counts", () => {
  const tracked: { name: string; anonId: string; properties: Record<string, unknown> }[] = [];
  const destination: AnalyticsDestination = { track: (e) => tracked.push(e) };
  const sink = new WarehouseTelemetrySink(destination);

  sink.recordExposure("exp.headline", "treatment", "anon_1", "reader");
  sink.recordExposure("exp.headline", "treatment", "anon_1", "reader"); // dedup
  sink.recordExposure("exp.headline", "treatment", "anon_2", "reader");
  sink.recordGoal("exp.headline", "treatment", "anon_1", "reader");

  assert.equal(sink.exposures("exp.headline", "treatment", "reader"), 2, "deduped by anonId");
  assert.equal(sink.conversions("exp.headline", "treatment", "reader"), 1);
  assert.deepEqual(sink.segments("exp.headline"), ["reader"]);

  // Every forwarded event carries only anonId + experiment metadata, no PII.
  assert.equal(tracked.length, 4);
  for (const e of tracked) {
    assert.ok(e.anonId.startsWith("anon_"));
    assert.ok(!("userId" in e.properties) && !("email" in e.properties));
  }
});

test("warehouse sink plugs into the experiment engine as the EventSink", () => {
  const destination: AnalyticsDestination = { track: () => {} };
  const sink = new WarehouseTelemetrySink(destination);
  const engine = new ComponentExperimentEngine([exp], sink);
  assert.equal(engine.sink, sink, "the external sink is used by the engine");
  assert.ok(Array.isArray(engine.assignmentsFor(profile())));
});
