import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type {
  ComponentManifest,
  GenerationRequest,
  JsonValue,
  SignalProfile,
  UINode,
  ExperimentAssignment,
} from "@dynui/contracts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const readJson = (p: string) => JSON.parse(readFileSync(join(root, p), "utf8"));

export const manifest = readJson("examples/fitness/manifest.example.json") as ComponentManifest;
export const data = readJson("examples/fitness/sample-activity.json") as Record<string, JsonValue>;
export const profiles = readJson(
  "examples/fitness/signal-profile.examples.json",
) as Record<string, SignalProfile>;

export const SURFACE = "activity-detail";

export function req(
  profile: SignalProfile,
  experiments: ExperimentAssignment[] = [],
): GenerationRequest {
  return { surface: SURFACE, profile, manifest, constraints: manifest.constraints, data, experiments };
}

export function componentIds(node: UINode): string[] {
  const out: string[] = [];
  (function walk(n: UINode) {
    if (n.componentId) out.push(n.componentId);
    (n.children ?? []).forEach(walk);
    Object.values(n.slots ?? {}).flat().forEach(walk);
  })(node);
  return out;
}
