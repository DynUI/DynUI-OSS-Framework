/**
 * Runtime schemas for every PUBLIC artifact. One definition per artifact yields
 * both the runtime validator (`parse*`) and the exported JSON Schema, so they
 * cannot drift.
 *
 * These reject malformed top-level shapes (strict objects, unknown keys) BEFORE
 * any business logic — the Phase 1 boundary. Cross-field rules that a single-pass
 * schema can't express (unique ids, dangling refs, version support) live in
 * `compat.ts`.
 */
import type { JsonValue } from "../json.js";
import type {
  SignalProfile,
  ComponentManifest,
  ComponentDef,
  BehavioralContract,
  SignalCondition,
  GlobalConstraints,
  UITree,
  UINode,
  GenerationMeta,
  ExperimentAssignment,
} from "../index.js";
import type { GenerationRequest } from "../model-provider.js";
import {
  type Schema,
  arr,
  bool,
  enums,
  jsonValue,
  lazy,
  num,
  obj,
  optional,
  record,
  str,
} from "./core.js";

const json = jsonValue() as Schema<JsonValue>;

/** Loose semver (major.minor.patch with optional prerelease/build). */
export const SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
const semver = () => str({ pattern: SEMVER, patternHint: "semver (e.g. 1.2.3)" });

// --- SignalProfile ---------------------------------------------------------

export const signalProfileSchema: Schema<SignalProfile> = obj({
  schemaVersion: str(),
  subject: obj({ anonId: str() }),
  consent: obj({
    personalization: bool(),
    analytics: bool(),
    modelTraining: bool(),
  }),
  context: obj({
    timestamp: str(),
    locale: str(),
    timezone: str(),
    surface: str(),
    device: obj({
      platform: enums(["ios", "android", "web"] as const),
      theme: optional(enums(["light", "dark"] as const)),
      reducedMotion: optional(bool()),
      viewport: optional(obj({ width: num(), height: num() })),
    }),
    session: obj({ isNew: bool(), count: num({ min: 0 }) }),
  }),
  preferences: record(json),
  traits: record(json),
  archetype: optional(
    obj({
      primary: str(),
      confidence: num({ min: 0, max: 1 }),
      secondary: optional(str()),
    }),
  ),
  behavior: record(num()),
  cohorts: optional(arr(str())),
}) as Schema<SignalProfile>;

// --- ComponentManifest -----------------------------------------------------

const signalConditionSchema: Schema<SignalCondition> = obj({
  signal: str(),
  op: enums(["gt", "gte", "lt", "lte", "eq", "neq", "in", "exists"] as const),
  value: optional(json),
  weight: optional(num()),
}) as Schema<SignalCondition>;

const behavioralContractSchema: Schema<BehavioralContract> = obj({
  audience: arr(str()),
  surfaces: arr(str()),
  showWhen: optional(arr(signalConditionSchema)),
  hideWhen: optional(arr(signalConditionSchema)),
  priority: num(),
  prominence: optional(enums(["hero", "primary", "secondary", "tertiary"] as const)),
  goals: optional(arr(str())),
}) as Schema<BehavioralContract>;

const dataType = () =>
  enums(["string", "number", "boolean", "series", "geojson", "object", "any"] as const);

const componentDefSchema: Schema<ComponentDef> = obj({
  id: str(),
  name: str(),
  version: semver(),
  figmaNodeId: optional(str()),
  category: str(),
  description: str(),
  intent: arr(str()),
  variants: arr(obj({ id: str(), description: str() })),
  slots: arr(
    obj({ id: str(), accepts: arr(str()), required: bool(), description: str() }),
  ),
  data: arr(
    obj({ key: str(), type: dataType(), required: bool(), source: optional(str()) }),
  ),
  contract: behavioralContractSchema,
  props: optional(
    arr(obj({ name: str(), type: dataType(), required: optional(bool()) })),
  ),
  a11y: optional(
    obj({
      interactive: optional(bool()),
      requiresLabel: optional(bool()),
      reducedMotionSafe: optional(bool()),
      requiresTextFallback: optional(bool()),
    }),
  ),
  engagementSignal: optional(str()),
  experiment: optional(obj({ id: str(), enableForVariant: str() })),
  owner: optional(str()),
  deprecated: optional(bool()),
  replacedBy: optional(str()),
  minRendererVersion: optional(str()),
}) as Schema<ComponentDef>;

const globalConstraintsSchema: Schema<GlobalConstraints> = obj({
  maxModulesAboveFold: optional(num({ min: 0, int: true })),
  neverHide: optional(arr(str())),
  pinned: optional(
    arr(obj({ componentId: str(), position: enums(["top", "bottom"] as const) })),
  ),
  stableAnchors: optional(arr(str())),
  allowedCategoriesBySurface: optional(record(arr(str()))),
  maxDepth: optional(num({ min: 0, int: true })),
  maxComponents: optional(num({ min: 1, int: true })),
  singletons: optional(arr(str())),
}) as Schema<GlobalConstraints>;

export const componentManifestSchema: Schema<ComponentManifest> = obj({
  schemaVersion: str(),
  registry: obj({ name: str(), version: semver(), domain: optional(str()) }),
  components: arr(componentDefSchema),
  constraints: globalConstraintsSchema,
  tokens: optional(record(json)),
  requiredTokens: optional(arr(str())),
}) as Schema<ComponentManifest>;

// --- UITree (recursive) ----------------------------------------------------

const experimentAssignmentSchema: Schema<ExperimentAssignment> = obj({
  experimentId: str(),
  variant: str(),
}) as Schema<ExperimentAssignment>;

const generationMetaSchema: Schema<GenerationMeta> = obj({
  generatedAt: str(),
  model: str(),
  cacheKey: str(),
  experiments: optional(arr(experimentAssignmentSchema)),
  fallback: bool(),
}) as Schema<GenerationMeta>;

const nodeExplanationSchema = obj({
  eligibility: arr(str()),
  nudges: arr(obj({ signal: str(), delta: num() })),
  basePriority: num(),
  score: num(),
  constraints: optional(arr(str())),
  fallbackReason: optional(str()),
});

export const uiNodeSchema: Schema<UINode> = obj({
  type: enums(["screen", "section", "component"] as const),
  componentId: optional(str()),
  variant: optional(str()),
  slots: optional(record(arr(lazy<UINode>("UINode", () => uiNodeSchema)))),
  props: optional(record(json)),
  dataBindings: optional(record(str())),
  children: optional(arr(lazy<UINode>("UINode", () => uiNodeSchema))),
  label: optional(str()),
  reason: optional(str()),
  explanation: optional(nodeExplanationSchema),
}) as Schema<UINode>;

export const uiTreeSchema: Schema<UITree> = obj({
  schemaVersion: str(),
  surface: str(),
  generatedFor: obj({ anonId: str(), archetype: optional(str()) }),
  meta: generationMetaSchema,
  root: uiNodeSchema,
}) as Schema<UITree>;

/** Named $defs for recursive JSON Schema emission. */
export const uiTreeDefs = { UINode: uiNodeSchema };

// --- GenerationRequest -----------------------------------------------------

export const generationRequestSchema: Schema<GenerationRequest> = obj({
  surface: str(),
  profile: signalProfileSchema,
  manifest: componentManifestSchema,
  constraints: globalConstraintsSchema,
  experiments: arr(experimentAssignmentSchema),
  data: record(json),
  options: optional(
    obj(
      {
        temperature: optional(num()),
        maxOutputTokens: optional(num({ int: true })),
        seedTree: optional(uiTreeSchema),
        repairErrors: optional(arr(json)),
        fallbackData: optional(record(json)),
      },
      { strict: false },
    ),
  ),
}) as Schema<GenerationRequest>;

// --- Telemetry: BehaviorEvent ---------------------------------------------

export const behaviorEventSchema = obj({
  type: enums([
    "exposure",
    "impression",
    "tap",
    "dwell",
    "goal",
    "dismissal",
    "render-error",
    "fallback",
  ] as const),
  id: optional(str()),
  anonId: str(),
  surface: str(),
  componentId: optional(str()),
  componentVersion: optional(str()),
  generationId: optional(str()),
  treeKey: optional(str()),
  experimentId: optional(str()),
  variant: optional(str()),
  goal: optional(str()),
  value: optional(num()),
  ts: str(),
  trainable: optional(bool()),
});

// --- SignalModel -----------------------------------------------------------

const opEnum = () =>
  enums(["gt", "gte", "lt", "lte", "eq", "neq", "in", "exists"] as const);

export const signalModelSchema = obj({
  schemaVersion: str(),
  domain: str(),
  version: semver(),
  segments: arr(
    obj({
      id: str(),
      signals: arr(
        obj({ signal: str(), weight: num(), op: optional(opEnum()), value: optional(json) }),
      ),
    }),
  ),
  minEvidence: optional(num({ min: 0 })),
  minConfidence: optional(num({ min: 0, max: 1 })),
  secondaryMinShare: optional(num({ min: 0, max: 1 })),
  decay: optional(obj({ halfLifeMs: num({ min: 0 }) })),
  coldStart: optional(obj({ segment: optional(str()) })),
  preferenceOverride: optional(obj({ path: str() })),
});

// --- Experiments: ExperimentDef -------------------------------------------

export const experimentDefSchema = obj({
  id: str(),
  description: str(),
  segment: arr(signalConditionSchema),
  allocation: num({ min: 0, max: 1 }),
  variants: arr(obj({ id: str(), weight: num({ min: 0 }) })),
  goal: str(),
  guardrails: optional(
    obj({ minSamplesPerVariant: optional(num({ min: 0, int: true })) }),
  ),
});
