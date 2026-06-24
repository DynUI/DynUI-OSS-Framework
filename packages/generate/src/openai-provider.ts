import type {
  GenerationRequest,
  GenerationResult,
  ModelProvider,
} from "@dynui/contracts";
import { buildPrompt } from "./prompt.js";
import { parseTree } from "./parse.js";

interface ChatCompletionResponse {
  choices?: { message?: { content?: string } }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number };
  error?: { message?: string };
}

/**
 * ModelProvider for any OpenAI-compatible chat-completions endpoint — including
 * OpenRouter (set baseURL to https://openrouter.ai/api/v1). Uses plain fetch (no
 * SDK dependency). You can run Claude models through OpenRouter via slugs like
 * "anthropic/claude-...".
 */
export class OpenAICompatibleModelProvider implements ModelProvider {
  readonly id: string;
  private readonly baseURL: string;

  constructor(
    private readonly opts: {
      apiKey: string;
      model: string;
      baseURL?: string;
      /** OpenRouter attribution headers (optional). */
      appUrl?: string;
      appName?: string;
    },
  ) {
    this.baseURL = opts.baseURL ?? "https://api.openai.com/v1";
    const host = this.baseURL.includes("openrouter") ? "openrouter" : "openai";
    this.id = `${host}:${opts.model}`;
  }

  async generate(req: GenerationRequest, opts?: { signal?: AbortSignal }): Promise<GenerationResult> {
    const { system, user } = buildPrompt(req);

    const res = await fetch(`${this.baseURL}/chat/completions`, {
      method: "POST",
      signal: opts?.signal,
      headers: {
        Authorization: `Bearer ${this.opts.apiKey}`,
        "Content-Type": "application/json",
        ...(this.opts.appUrl ? { "HTTP-Referer": this.opts.appUrl } : {}),
        ...(this.opts.appName ? { "X-Title": this.opts.appName } : {}),
      },
      body: JSON.stringify({
        model: this.opts.model,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        max_tokens: req.options?.maxOutputTokens ?? 16000,
        temperature: req.options?.temperature ?? 0.4,
      }),
    });

    if (!res.ok) {
      throw new Error(`${this.id} HTTP ${res.status}: ${await res.text()}`);
    }

    const json = (await res.json()) as ChatCompletionResponse;
    if (json.error) throw new Error(`${this.id}: ${json.error.message ?? "unknown error"}`);

    const text = json.choices?.[0]?.message?.content ?? "";
    const tree = parseTree(text);
    return {
      tree,
      usage: json.usage
        ? {
            inputTokens: json.usage.prompt_tokens ?? 0,
            outputTokens: json.usage.completion_tokens ?? 0,
          }
        : undefined,
      raw: json,
    };
  }
}
