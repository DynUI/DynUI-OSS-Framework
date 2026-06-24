# LinkedIn Draft

I am preparing DynUI for public release.

DynUI is an open source framework for contract-validated personalized UI: adaptive
app screens composed from real product components, user signals, consent, and
experiments.

The important constraint is safety. Generated output is a `UITree` of registered
components, not arbitrary markup or code, and every tree is validated before render.
Models are optional; the deterministic engine works without API keys and is the
request-time safe path.

The alpha includes packages for contracts, validation, generation, privacy,
experiments, telemetry, profile adapters, Figma manifest extraction, examples, evals,
and release plumbing.

I would love feedback from product engineers working on personalization,
server-driven UI, experimentation, or design-system governance.
