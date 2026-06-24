# @dynui/telemetry

Closes the loop: turn interactions into behavior signals + an inferred segment.

## API
- Events: `BehaviorEvent` (`exposure | impression | tap | dwell | goal | dismissal
  | render-error | fallback`, with `id`/`generationId`/`treeKey`/`componentVersion`).
- `BatchingLogger(transport, batchSize, enabled?)` — buffers + ships events; the
  `enabled` predicate is the **analytics consent gate**. Sinks: `arraySink`,
  `consoleSink`. `markTraining(event, consent)` stamps `trainable:false` when
  training consent is withheld.
- Exposure correctness: `buildExposureEvents(rendered, ctx)` (once per rendered
  component per generation), `renderErrorEvent`, `fallbackEvent`, `tapEvent`.
- `aggregateBehavior(events, manifest)` — events → behavior signals, **deduped by
  event id**.
- `inferArchetype(behavior, model?)`, `applyBehavior`, `DEFAULT_FITNESS_SIGNAL_MODEL`.
