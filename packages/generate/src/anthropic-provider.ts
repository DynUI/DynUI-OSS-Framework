import type Anthropic from "@anthropic-ai/sdk";
import type {
  GenerationRequest,
  GenerationResult,
  ModelProvider,
} from "@dynui/contracts";
import { buildPrompt } from "./prompt.js";
import { parseTree } from "./parse.js";

/**
 * Anthropic-backed ModelProvider (reads ANTHROPIC_API_KEY, or pass `apiKey`).
 *
 * `@anthropic-ai/sdk` is an OPTIONAL peer dependency. It is imported lazily on the
 * first `generate()` call, so importing `@dynui/generate` (and using the
 * deterministic engine / fallback) never requires the SDK to be installed. If you
 * construct this provider without the SDK present, `generate()` throws a clear,
 * actionable error.
 *
 * Note on structured outputs: the UITree is recursive, and the API's JSON-schema
 * structured-output mode does not support recursive schemas — so we instruct
 * JSON-only output and parse it ourselves. The orchestrator then validates the
 * parsed tree against the manifest (the real safety net), with a deterministic
 * fallback if parsing or validation fails.
 */
export class AnthropicModelProvider implements ModelProvider {
  readonly id: string;
  private readonly model: string;
  private readonly apiKey?: string;
  private client?: Anthropic;

  constructor(opts?: { apiKey?: string; model?: string }) {
    this.model = opts?.model ?? "claude-opus-4-8";
    this.id = `anthropic:${this.model}`;
    this.apiKey = opts?.apiKey;
  }

  /** Lazily resolve the optional SDK and construct the client (cached). */
  private async getClient(): Promise<Anthropic> {
    if (this.client) return this.client;
    let mod: typeof import("@anthropic-ai/sdk");
    try {
      mod = await import("@anthropic-ai/sdk");
    } catch {
      throw new Error(
        "AnthropicModelProvider requires the optional peer dependency '@anthropic-ai/sdk'. " +
          "Install it (`npm i @anthropic-ai/sdk`) or use a different ModelProvider " +
          "(e.g. OpenAICompatibleModelProvider, or your own). The deterministic engine " +
          "and fallback need no provider SDK.",
      );
    }
    const AnthropicCtor = mod.default;
    this.client = new AnthropicCtor(this.apiKey ? { apiKey: this.apiKey } : {});
    return this.client;
  }

  async generate(req: GenerationRequest, opts?: { signal?: AbortSignal }): Promise<GenerationResult> {
    const { system, user } = buildPrompt(req);
    const client = await this.getClient();

    const resp = await client.messages.create(
      {
        model: this.model,
        max_tokens: 16000,
        // Stable vocabulary/rules cached across users; volatile profile/data in the user turn.
        system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
        messages: [{ role: "user", content: user }],
      },
      { signal: opts?.signal },
    );

    const text = resp.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");

    const tree = parseTree(text);
    return {
      tree,
      usage: {
        inputTokens: resp.usage.input_tokens,
        outputTokens: resp.usage.output_tokens,
      },
      raw: resp,
    };
  }
}
