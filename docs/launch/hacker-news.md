# Hacker News Draft

Title:

Show HN: DynUI - contract-validated personalized UI without model-owned markup

Post:

I built DynUI, an open source TypeScript framework for personalized app screens.
The idea is to keep personalization structural but bounded: product teams register
real components in a manifest, the generator composes a `UITree`, and a validator
rejects anything off-contract before render.

It works without a model via a deterministic engine. Optional model providers can
help compose screens, but they only output references to registered components and
always sit behind validation and fallback. Consent is enforced in code, so
no-consent profiles get neutral output.

The repo includes packages for contracts, generation, validation, privacy,
experiments, telemetry, profile adapters, and Figma manifest extraction, plus a
fitness reference renderer and a non-fitness news example.

I would especially like feedback on the API boundaries and whether the manifest
contract is understandable from the docs.
