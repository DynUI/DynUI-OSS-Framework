import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { ComponentManifest, GenerationRequest, JsonValue, SignalProfile } from "@dynui/contracts";
import {
  createHmacAnonymizer,
  insecureAnonymizer,
  isAllowedSignal,
  isSensitiveSignal,
  minimizeProfileForPrompt,
  redact,
  redactString,
  redactError,
  sanitizeTreeForPrompt,
  personalizationAllowed,
  analyticsAllowed,
  trainingAllowed,
} from "@dynui/privacy";
import { buildPrompt, generateScreen } from "@dynui/generate";
import type { ModelProvider, UITree } from "@dynui/contracts";
import { BatchingLogger, arraySink, markTraining } from "@dynui/telemetry";
import { BaseProfileAdapter, InMemoryProfileStore } from "@dynui/profile";

const root = join(import.meta.dirname, "..");
const rj = (p: string) => JSON.parse(readFileSync(join(root, p), "utf8"));
const clone = <T>(x: T): T => structuredClone(x);
const fitness = rj("examples/fitness/manifest.example.json") as ComponentManifest;
const data = rj("examples/fitness/sample-activity.json") as Record<string, JsonValue>;
const perf = rj("tests/fixtures/profiles/valid/performance.json") as SignalProfile;
const noConsent = rj("tests/fixtures/profiles/valid/no-consent.json") as SignalProfile;

const req = (profile: SignalProfile): GenerationRequest => ({
  surface: "activity-detail",
  profile,
  manifest: fitness,
  constraints: fitness.constraints,
  experiments: [],
  data,
});

// --- anonymization ---------------------------------------------------------

test("HMAC anonymizer: consistent for same secret, different for different secret", () => {
  const a = createHmacAnonymizer("secret-A");
  const b = createHmacAnonymizer("secret-B");
  assert.equal(a("user-12345"), a("user-12345"), "same user+secret is stable");
  assert.notEqual(a("user-12345"), b("user-12345"), "different secret => different id");
  assert.ok(!a("user-12345").includes("user-12345"), "raw id is not recoverable from output");
});

test("anonymizer requires a secret", () => {
  assert.throws(() => createHmacAnonymizer(""), /secret/);
});

// --- sensitivity model -----------------------------------------------------

test("sensitivity is default-deny: allow-listed pass, sensitive + unknown denied", () => {
  assert.ok(isAllowedSignal("behavior.fitness.engagement.charts.openRate"));
  assert.ok(isAllowedSignal("archetype.primary"));
  assert.ok(!isAllowedSignal("health.restingHeartRate"), "sensitive namespace denied");
  assert.ok(!isAllowedSignal("contact.email"), "sensitive namespace denied");
  assert.ok(!isAllowedSignal("behavior.someUnknownDomain.x"), "unknown namespace denied by default");
  assert.ok(isSensitiveSignal("health.x"));
});

// --- prompt minimization ---------------------------------------------------

test("minimized profile carries no identifier and no raw behavior map", () => {
  const m = minimizeProfileForPrompt(perf, {
    requiredSignals: ["behavior.fitness.engagement.charts.openRate", "health.restingHR"],
  });
  assert.equal((m as unknown as Record<string, unknown>).subject, undefined, "no subject/anonId");
  assert.ok(m.archetype, "archetype kept for personalization");
  // Only the allowed, required signal is present — the sensitive one is dropped.
  assert.ok("behavior.fitness.engagement.charts.openRate" in m.signals);
  assert.ok(!("health.restingHR" in m.signals), "sensitive signal dropped");
  // The full behavior map is not copied wholesale.
  assert.ok(!("fitness.training.weeklyLoadKm" in m.signals));
});

test("no-consent minimization withholds archetype and signals entirely", () => {
  const m = minimizeProfileForPrompt(noConsent, { requiredSignals: ["behavior.fitness.engagement.charts.openRate"] });
  assert.equal(m.archetype, undefined);
  assert.deepEqual(m.signals, {});
});

test("prompt snapshot contains no raw anonId, email, or sensitive path", () => {
  const p = clone(perf);
  p.subject.anonId = "u_secret_raw_id_98765";
  p.preferences = { ...p.preferences, "contact.email": "leak@example.com" as unknown as JsonValue };
  const { user, system } = buildPrompt(req(p));
  const blob = `${system}\n${user}`;
  assert.ok(!blob.includes("u_secret_raw_id_98765"), "anonId must not reach the model");
  assert.ok(!blob.includes("leak@example.com"), "sensitive contact must not reach the model");
  assert.ok(!/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/.test(blob), "no email-like strings");
  // But the useful, allowed signal IS present.
  assert.ok(user.includes("performance"), "archetype still informs the model");
});

// --- repair-prompt privacy (Phase 1) ---------------------------------------

test("sanitizeTreeForPrompt blanks the anonId, scrubs identifiers, preserves structure, and does not mutate", () => {
  const seed = rj("tests/fixtures/trees/valid/flat-performance.json") as UITree;
  // Simulate a worst case: the prior tree carries a real id + an email in free text.
  seed.generatedFor.anonId = "u_real_stamped_id_42";
  (seed.root.children![0] as { reason?: string }).reason = "contact leak@example.com about this";
  const before = structuredClone(seed);

  const out = sanitizeTreeForPrompt(seed);
  const blob = JSON.stringify(out);
  assert.equal(out.generatedFor.anonId, "", "anonId blanked");
  assert.ok(!blob.includes("u_real_stamped_id_42"), "stamped id scrubbed");
  assert.ok(!/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/.test(blob), "no email-like string survives");
  assert.ok(blob.includes("activity-headline"), "component structure preserved for repair");
  assert.deepEqual(seed, before, "the original tree is not mutated");
});

test("repair prompt body contains no stamped anonId or email but keeps repairable structure", () => {
  const p = clone(perf);
  const seed = rj("tests/fixtures/trees/valid/flat-performance.json") as UITree;
  seed.generatedFor.anonId = p.subject.anonId; // worst case: a stamped id on the seed
  (seed.root.children![0] as { reason?: string }).reason = "see operator@corp.com";
  const r: GenerationRequest = {
    ...req(p),
    options: {
      seedTree: seed,
      repairErrors: [{ code: "unknown-component", nodePath: "root", message: "fix me" }],
    },
  };
  const { system, user } = buildPrompt(r);
  const blob = `${system}\n${user}`;
  assert.ok(!blob.includes(p.subject.anonId), "repair prompt must not leak the anonId");
  assert.ok(!blob.includes("operator@corp.com"), "repair prompt must not leak an email");
  assert.ok(!/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/.test(blob), "no email-like string");
  assert.ok(user.includes("activity-headline"), "repair prompt keeps prior structure to fix");
});

test("repair flow: model never sees the anonId, but the accepted tree carries the authoritative id", async () => {
  const p = clone(perf);
  const valid = rj("tests/fixtures/trees/valid/flat-performance.json") as UITree;
  valid.generatedFor.anonId = ""; // a well-behaved model leaves it blank
  // First attempt: invalid (unknown component) AND echoes the real id, to prove
  // the orchestrator never feeds a stamped id into the repair prompt.
  const invalid = structuredClone(valid);
  invalid.generatedFor.anonId = p.subject.anonId;
  (invalid.root.children![0].children![0] as { componentId?: string }).componentId = "nope-not-real";

  const seenPrompts: string[] = [];
  const provider: ModelProvider = {
    id: "capturing:test",
    async generate(rq) {
      seenPrompts.push(buildPrompt(rq).user);
      const tree = seenPrompts.length === 1 ? invalid : valid;
      return { tree: structuredClone(tree) };
    },
  };

  const res = await generateScreen(provider, req(p), { maxRepairs: 1 });
  assert.equal(seenPrompts.length, 2, "one initial + one repair attempt");
  for (const promptBody of seenPrompts) {
    assert.ok(!promptBody.includes(p.subject.anonId), "no prompt (initial or repair) contains the anonId");
  }
  assert.equal(res.validation.ok, true, "repaired to a valid tree");
  assert.equal(res.usedFallback, false);
  assert.equal(res.tree.generatedFor?.anonId, p.subject.anonId, "final tree carries the authoritative id");
});

// --- redaction -------------------------------------------------------------

test("redaction masks API keys and emails in provider-style error strings", () => {
  const s = redactString("Provider 401: invalid key sk-ant-abcd1234efgh5678 for user@corp.com");
  assert.ok(!s.includes("sk-ant-abcd1234efgh5678"));
  assert.ok(!s.includes("user@corp.com"));
});

test("redaction masks sensitive keys in objects (validation/renderer error payloads)", () => {
  const out = redact({
    code: "render-error",
    componentId: "training-load-chart",
    userId: "real-user-42",
    email: "a@b.com",
    nested: { token: "sk-or-zzzz1111yyyy2222", note: "see x@y.com" },
  }) as Record<string, unknown>;
  assert.equal(out.userId, "[redacted]");
  assert.equal(out.email, "[redacted]");
  assert.equal(out.componentId, "training-load-chart", "non-sensitive fields preserved");
  const nested = out.nested as Record<string, unknown>;
  assert.equal(nested.token, "[redacted]");
  assert.ok(!String(nested.note).includes("x@y.com"));
});

test("redactError handles Error and string inputs", () => {
  assert.ok(!redactError(new Error("boom for a@b.com")).includes("a@b.com"));
  assert.ok(!redactError("key sk-ant-xxxxxxxxxxxx leaked").includes("sk-ant-xxxxxxxxxxxx"));
});

// --- consent gates ---------------------------------------------------------

test("consent predicates read the profile consistently", () => {
  assert.ok(personalizationAllowed(perf));
  assert.ok(analyticsAllowed(perf));
  assert.ok(!personalizationAllowed(noConsent));
  assert.ok(!analyticsAllowed(noConsent));
  assert.ok(trainingAllowed(perf), "perf opted into modelTraining");
  assert.ok(!trainingAllowed(noConsent), "modelTraining is opt-in; no-consent withholds it");
});

test("analytics-disabled sessions produce no behavior events", async () => {
  const out: unknown[] = [];
  const logger = new BatchingLogger(arraySink(out as never), 1, () => analyticsAllowed(noConsent));
  logger.log({ type: "tap", anonId: "a", surface: "activity-detail", componentId: "x" });
  await logger.flush();
  assert.equal(out.length, 0, "no events captured when analytics consent is withheld");
});

test("analytics-disabled ingestion writes no behavior delta", async () => {
  const store = new InMemoryProfileStore();
  const adapter = new BaseProfileAdapter(store, { anonymize: insecureAnonymizer });
  await adapter.ingestBehavior("user-1", { "fitness.engagement.charts.openRate": 0.9 }, { analyticsConsent: false });
  const resolved = await adapter.resolveProfile("user-1", { surface: "activity-detail" });
  assert.deepEqual(resolved.behavior, {}, "no behavior ingested under analytics=false");

  await adapter.ingestBehavior("user-1", { "fitness.engagement.charts.openRate": 0.9 }, { analyticsConsent: true });
  const resolved2 = await adapter.resolveProfile("user-1", { surface: "activity-detail" });
  assert.ok((resolved2.behavior["fitness.engagement.charts.openRate"] ?? 0) > 0, "ingested when consent granted");
});

test("modelTraining=false marks events as non-trainable", () => {
  const base = { type: "tap" as const, anonId: "a", surface: "s" };
  assert.equal(markTraining(base, trainingAllowed(noConsent)).trainable, false);
  assert.equal(markTraining(base, true).trainable, undefined, "no restriction recorded when allowed");
});
