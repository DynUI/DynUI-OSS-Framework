# @dynui/experiments

Component-level experimentation. The unit under test is a registered
component/variant (a canary), so outcomes attribute cleanly.

## API
- `ComponentExperimentEngine(experiments, sink?, { assignmentAdapter? })` —
  `assign` / `assignmentsFor` (deterministic, no round-trip), `recordExposure` /
  `recordGoal`, and `analyze(id, { now? })`.
- `analyze` returns `recommendation` (`promote | rollback | keep-running`) plus
  `pValue`, `significant`, `dataSufficient`, `runtimeOk`, `srm`, `guardrails`,
  `segments`. It only recommends promote/rollback when assignment, exposure, sample
  size, runtime, SRM, and guardrail checks all pass.
- `InMemoryEventSink` (default; tracks exposures/goals/guardrails/segments).
- `assignVariant`, `hashFraction` (cyrb53 bucketing), `twoProportionPValue`,
  `srmPValue`.
- Interfaces: `EventSink`, `WarehouseExport`, `AssignmentAdapter`
  (GrowthBook/Statsig-compatible).
