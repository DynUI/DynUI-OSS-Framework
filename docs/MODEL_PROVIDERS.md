# Model Providers

Model providers are optional. DynUI accepts any implementation of the
`ModelProvider` interface and validates every generated `UITree` before render.

## Built-In Providers

- `HeuristicModelProvider`: deterministic, no key, no SDK.
- `OpenAICompatibleModelProvider`: plain `fetch` against an OpenAI-compatible API.
- `AnthropicModelProvider`: uses `@anthropic-ai/sdk`, loaded lazily as an optional
  peer dependency.

## Request-Time Rule

Do not block request-time render on live model generation. Use deterministic
generation or a cached tree for the render path. Run live providers in background,
cache-warming, or session-boundary flows with a timeout.

```ts
const result = await generateScreen(provider, request, {
  maxRepairs: 1,
  timeoutMs: 3000,
});
```

If the provider fails, times out, or returns invalid output, `generateScreen`
returns a deterministic fallback tree or an explicit `unrenderable` result.

## Custom Provider

```ts
import type { GenerationRequest, GenerationResult, ModelProvider } from "@dynui/contracts";

export class MyProvider implements ModelProvider {
  id = "my-provider";

  async generate(req: GenerationRequest): Promise<GenerationResult> {
    return {
      tree: await callYourModel(req),
      usage: { inputTokens: 0, outputTokens: 0 },
    };
  }
}
```

The provider should not receive raw profile data. DynUI's prompt builder uses a
minimized projection and strips identifiers before calling a provider.

## Provider Checklist

- [ ] No real user ids, emails, names, or raw behavior are sent.
- [ ] `timeoutMs` is set.
- [ ] Provider errors are redacted before logging.
- [ ] Deterministic evaluation passes with `npm run eval:generation`.
- [ ] Live-provider evaluation passes with `DYNUI_EVAL_LIVE=1 npm run eval:generation`
      before enabling a provider-backed flow.
- [ ] The app branches on `res.unrenderable`.
