/**
 * @dynui/generate — the generation service.
 *
 *   generateScreen(provider, req) → { tree, validation, usedFallback }
 *
 * Providers implement the ModelProvider interface:
 *   - HeuristicModelProvider : deterministic, no API key (also the fallback engine)
 *   - AnthropicModelProvider : LLM-backed generation (Opus 4.8)
 */
export { generateScreen } from "./orchestrator.js";
export type { ScreenResult, GenerationDiagnostics, GenerateOptions } from "./orchestrator.js";
export { normalizeTree } from "./normalize.js";
export type { NormalizeLimits, NormalizeResult } from "./normalize.js";
export { HeuristicModelProvider } from "./heuristic-provider.js";
export { AnthropicModelProvider } from "./anthropic-provider.js";
export { OpenAICompatibleModelProvider } from "./openai-provider.js";
export { parseTree } from "./parse.js";
export { composeHeuristic } from "./heuristic.js";
export { buildPrompt } from "./prompt.js";
export { getSignal, evalCondition } from "./signal.js";
export { buildCacheKey, cacheContextFromProfile } from "./cache-key.js";
export type { CacheKeyInput } from "./cache-key.js";
export { defaultPolicy, resolvePolicy } from "./policy.js";
export type { RankPolicy } from "./policy.js";
