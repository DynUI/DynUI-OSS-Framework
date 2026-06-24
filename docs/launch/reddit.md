# Reddit Draft

Title:

I built DynUI, an OSS framework for contract-validated personalized app screens

Post:

DynUI is a TypeScript framework for teams that want app screens to adapt to user
signals, consent, and experiments while keeping the actual UI inside a governed
component system.

The key idea: models, if used, never create markup or arbitrary UI. They compose a
`UITree` from registered components, and the validator rejects anything outside the
manifest contract before render. There is also a deterministic engine, so the whole
flow works with no model key.

Useful if you are dealing with server-driven UI, personalization, experimentation,
or design-system governance. Probably overkill if you only need a feature flag or
CMS swap.

I am looking for feedback on the API shape, docs, and safety model.
