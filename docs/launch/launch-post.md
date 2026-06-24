# Launch Post Draft

DynUI is an open source framework for contract-validated personalized UI.

Modern apps often need more than a feature flag: one user should see a dense
performance dashboard, another should see a calmer recovery screen, and another
should see social context first. The hard part is making those differences safe.

DynUI keeps the UI vocabulary inside your design system. You register components
with behavioral contracts, compose a `UITree` from a `SignalProfile`, and validate
the result before render. The generator can be deterministic or model-assisted; the
model never gets arbitrary control over markup or code.

The alpha includes contracts, runtime schemas, deterministic generation, optional
model providers, validation, privacy primitives, experiments, telemetry, profile
adapters, Figma manifest extraction, examples, evals, and CI release plumbing.

Start here: `npm install && npm run demo:no-model`.
