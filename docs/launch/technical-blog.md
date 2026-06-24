# Contract-Validated Personalized UI

Personalization usually starts simple: a feature flag, a copied screen variant, a
manual segment rule. Eventually the product asks for something richer. A performance
user should get dense metrics, a wellness user should get recovery guidance, and a
new user should get a calmer introduction.

The risk is giving the generation layer too much power. If a model can invent UI,
the product loses renderer safety, accessibility guarantees, experiment attribution,
and predictable privacy boundaries.

DynUI takes a narrower path. The design system remains the vocabulary. A
`ComponentManifest` declares which components exist, where they can appear, what data
they need, which audiences they serve, and which experiments gate them. Generation
produces a `UITree` made only of those components. Validation rejects anything that
violates the contract.

This makes personalization structural but bounded. The screen can change shape, but
only within the rails the product team authored.

The model is optional. A deterministic engine can compose valid screens without a
provider, and live providers are best suited for background or cache-warming flows.
Request-time rendering should use deterministic generation or cached trees.

The result is a practical split of responsibilities:

- designers and engineers own the component contract;
- the app owns consent, profiles, rendering, telemetry, and model endpoints;
- DynUI owns generation orchestration, validation, privacy primitives, and the
  integration seams between them.

That is the core bet: personalized UI should adapt per user, but it should still be
governed like product software.
