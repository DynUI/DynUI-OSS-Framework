# @dynui/signal

Resolve and evaluate signal-path conditions against a `SignalProfile`, and evaluate
domain `SignalModel`s. Shared by generation, experiments, and telemetry.

## API
- `getSignal(profile, path)` — resolve a dotted path (`behavior.*`, `preferences.*`,
  `traits.*` are flat namespaced maps; everything else is a nested lookup).
- `evalCondition(profile, cond)` / `matchesAll(profile, conds)` — evaluate
  `SignalCondition`s (`gt|gte|lt|lte|eq|neq|in|exists`).
- `inferSegment(profile, model)` — domain-agnostic segment inference from a
  `SignalModel` (weighted/gated signals → `{ primary, confidence, secondary? }`,
  with cold-start and preference-override policy).
- `applyDecay(behavior, elapsedMs, halfLifeMs)` — exponential time decay so stale
  behavior drifts back toward neutral.
