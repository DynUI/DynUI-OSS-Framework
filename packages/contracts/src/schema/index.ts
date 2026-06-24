/**
 * @dynui/contracts/schema — runtime validation for the public artifacts.
 *
 * Hand-rolled (zero runtime deps). Each schema validates a value AND emits JSON
 * Schema from one definition, so the runtime checks and the exported `.json`
 * artifacts cannot drift.
 */
export {
  type Schema,
  type SchemaIssue,
  type ParseResult,
  parse,
  jsonSchemaDocument,
} from "./core.js";

export {
  signalProfileSchema,
  componentManifestSchema,
  uiTreeSchema,
  uiNodeSchema,
  uiTreeDefs,
  generationRequestSchema,
  behaviorEventSchema,
  experimentDefSchema,
  signalModelSchema,
  SEMVER,
} from "./artifacts.js";

export {
  SCHEMA_VERSIONS,
  SUPPORTED_VERSIONS,
  formatIssues,
  checkManifestCompatibility,
  parseSignalProfile,
  parseComponentManifest,
  parseUITree,
  parseGenerationRequest,
  parseBehaviorEvent,
  parseExperimentDef,
  parseSignalModel,
  migrateManifest,
  migrateUITree,
} from "./compat.js";
