# Comparisons

DynUI is for contract-validated structural personalization. It overlaps with a few
familiar categories, but it should not replace them when the problem is simpler.

## Feature Flags

Use a feature flag system when you need to enable, disable, or target a known
feature. DynUI is useful when the whole screen structure changes: module ordering,
nesting, density, above-the-fold priority, and experiment attribution.

## CMS Tools

Use a CMS for editorial content, marketing pages, scheduling, and content workflow.
DynUI assumes the UI components already exist in your product and composes those
components against a `SignalProfile`.

## A/B Testing Platforms

Use an A/B testing platform directly for copy, image, or single-variant tests.
DynUI complements experimentation systems when the experimental unit is a registered
component or variant and the generated screen still needs validation.

## Server-Driven UI Frameworks

Server-driven UI moves screen description to the server. DynUI adds a narrower
layer on top: behavioral contracts, consent-aware generation, model-optional
composition, and validation against a governed component manifest.

## Rule Of Thumb

If the decision is "show A or B", use a flag or experiment. If the decision is
"compose the right screen from known components for this user while preserving
privacy, consent, and renderer safety", DynUI is the fit.
