# Deterministic-Only Mode

DynUI does not require a model provider. The deterministic engine is the request
time-safe path and the fallback used when a live provider times out, throws,
returns malformed JSON, or generates an invalid tree.

## When To Use It

Use deterministic-only mode when:

- the screen must render immediately;
- model latency is unacceptable;
- a deployment has no model credentials;
- a regulated path should avoid provider calls entirely;
- you want a baseline behavior before enabling model-assisted composition.

## How It Works

```ts
import { generateScreen, HeuristicModelProvider } from "@dynui/generate";

const result = await generateScreen(new HeuristicModelProvider(), {
  surface,
  profile,
  manifest,
  constraints: manifest.constraints,
  experiments,
  data,
});

if (result.unrenderable) {
  // Show an app-owned empty/error state.
} else {
  render(result.tree);
}
```

The heuristic path runs the same safety gate as model output:

- component eligibility;
- consent-aware audience checks;
- required data checks;
- experiment gates;
- layout constraints;
- `validateRenderableTree`.

## Guarantees

- No provider SDK is required.
- No model call is made.
- Output is deterministic for the same inputs, aside from timestamp metadata.
- Cache keys exclude identifiers and raw behavior.
- The result is either renderable or explicitly `unrenderable`.

See [packages/generate/README.md](../packages/generate/README.md) for ranking,
fallback, and cache-key details.
