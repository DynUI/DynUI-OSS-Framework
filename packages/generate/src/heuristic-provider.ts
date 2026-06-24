import type {
  GenerationRequest,
  GenerationResult,
  ModelProvider,
} from "@dynui/contracts";
import { composeHeuristic } from "./heuristic.js";
import type { RankPolicy } from "./policy.js";

/**
 * Zero-dependency, no-API-key provider that composes the screen straight from the
 * behavioral contracts. Deterministic — ideal for tests, CI, and offline demos,
 * and the same engine used as the orchestrator's fallback. An optional RankPolicy
 * tunes ranking/cold-start/caps without forking the engine.
 */
export class HeuristicModelProvider implements ModelProvider {
  readonly id = "heuristic:dynui-rules";

  constructor(private readonly policy?: RankPolicy) {}

  async generate(req: GenerationRequest): Promise<GenerationResult> {
    return { tree: composeHeuristic(req, this.policy) };
  }
}
