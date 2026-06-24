/**
 * Deterministic mock providers for the generation eval. These exercise the two
 * failure modes the orchestrator must absorb without ever shipping a bad tree:
 *
 *  - InvalidModelProvider:   emits well-formed JSON that is an INVALID tree
 *                            (unknown component + missing neverHide) → validation
 *                            fails → orchestrator falls back.
 *  - MalformedModelProvider: emits text with no parseable JSON object, exercising
 *                            the real parse path → throws → orchestrator falls back.
 */
import type { GenerationRequest, GenerationResult, ModelProvider } from "@dynui/contracts";
import { parseTree } from "@dynui/generate";

export class InvalidModelProvider implements ModelProvider {
  id = "mock:invalid";
  async generate(req: GenerationRequest): Promise<GenerationResult> {
    return {
      tree: {
        schemaVersion: "ui-tree/1.0",
        surface: req.surface,
        generatedFor: { anonId: req.profile.subject.anonId },
        meta: {
          generatedAt: new Date().toISOString(),
          model: this.id,
          cacheKey: "mock",
          experiments: req.experiments,
          fallback: false,
        },
        root: {
          type: "screen",
          children: [{ type: "component", componentId: "this-component-does-not-exist" }],
        },
      },
    };
  }
}

export class MalformedModelProvider implements ModelProvider {
  id = "mock:malformed";
  async generate(_req: GenerationRequest): Promise<GenerationResult> {
    // No JSON object anywhere — parseTree throws, mirroring a real bad completion.
    const tree = parseTree("I'm sorry, I cannot help with that request.");
    return { tree };
  }
}

/** Always throws — exercises the provider-error → fallback path. */
export class ThrowingModelProvider implements ModelProvider {
  id = "mock:throwing";
  async generate(_req: GenerationRequest): Promise<GenerationResult> {
    throw new Error("upstream provider unavailable");
  }
}

/** Resolves far slower than any latency budget — exercises timeout → fallback. */
export class SlowModelProvider implements ModelProvider {
  id = "mock:slow";
  constructor(private readonly delayMs = 5000) {}
  generate(_req: GenerationRequest): Promise<GenerationResult> {
    return new Promise((resolve) =>
      setTimeout(() => resolve({ tree: { schemaVersion: "ui-tree/1.0", surface: "x", generatedFor: { anonId: "x" }, meta: { generatedAt: "", model: "slow", cacheKey: "x", experiments: [], fallback: false }, root: { type: "screen", children: [] } } }), this.delayMs),
    );
  }
}
