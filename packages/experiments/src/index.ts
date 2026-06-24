/**
 * @dynui/experiments — component-level experimentation.
 *
 *   - assignVariant / hashFraction : deterministic, no round-trip assignment
 *   - ComponentExperimentEngine    : assign → log → analyze (promote/rollback)
 *   - InMemoryEventSink            : default store; swap for a real one in prod
 *
 * The unit of experiment is always a registered component/variant (gated via
 * ComponentDef.experiment), so outcomes attribute cleanly — never raw model output.
 */
export { ComponentExperimentEngine, InMemoryEventSink } from "./engine.js";
export { assignVariant, hashFraction } from "./assign.js";
export { twoProportionPValue, srmPValue } from "./stats.js";
export type {
  ExperimentDef,
  ExperimentResult,
  VariantStat,
  Recommendation,
  SrmStatus,
  GuardrailStatus,
  SegmentResult,
  EventSink,
  WarehouseExport,
  AssignmentAdapter,
} from "./types.js";
