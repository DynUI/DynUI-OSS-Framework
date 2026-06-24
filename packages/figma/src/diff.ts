import type { ComponentDef, ComponentManifest } from "@dynui/contracts";

export interface ComponentChange {
  id: string;
  addedRequiredData: string[];
  removedData: string[];
  removedVariants: string[];
  contractChanged: boolean;
  experimentChanged: boolean;
  breaking: boolean;
}

export interface ManifestDiff {
  added: string[];
  removed: string[];
  changed: ComponentChange[];
  constraintsChanged: boolean;
  /** True if any change could break existing renderers/generation. */
  breaking: boolean;
  summary: string;
}

const requiredKeys = (c: ComponentDef) => c.data.filter((d) => d.required).map((d) => d.key);
const allKeys = (c: ComponentDef) => c.data.map((d) => d.key);
const expKey = (c: ComponentDef) => (c.experiment ? `${c.experiment.id}:${c.experiment.enableForVariant}` : "");

/**
 * Diff a previous accepted manifest against a candidate. Surfaces what changed and
 * whether the change is BREAKING — a new required data key, a removed component or
 * variant, or a changed experiment gate all break existing renderers/attribution.
 */
export function diffManifest(prev: ComponentManifest, next: ComponentManifest): ManifestDiff {
  const prevById = new Map(prev.components.map((c) => [c.id, c]));
  const nextById = new Map(next.components.map((c) => [c.id, c]));

  const added = [...nextById.keys()].filter((id) => !prevById.has(id));
  const removed = [...prevById.keys()].filter((id) => !nextById.has(id));

  const changed: ComponentChange[] = [];
  for (const [id, nc] of nextById) {
    const pc = prevById.get(id);
    if (!pc) continue;
    const addedRequiredData = requiredKeys(nc).filter((k) => !requiredKeys(pc).includes(k));
    const removedData = allKeys(pc).filter((k) => !allKeys(nc).includes(k));
    const removedVariants = pc.variants.map((v) => v.id).filter((v) => !nc.variants.some((x) => x.id === v));
    const contractChanged = JSON.stringify(pc.contract) !== JSON.stringify(nc.contract);
    const experimentChanged = expKey(pc) !== expKey(nc);
    const breaking = addedRequiredData.length > 0 || removedData.length > 0 || removedVariants.length > 0 || experimentChanged;
    if (addedRequiredData.length || removedData.length || removedVariants.length || contractChanged || experimentChanged) {
      changed.push({ id, addedRequiredData, removedData, removedVariants, contractChanged, experimentChanged, breaking });
    }
  }

  const constraintsChanged = JSON.stringify(prev.constraints) !== JSON.stringify(next.constraints);
  const breaking = removed.length > 0 || changed.some((c) => c.breaking);

  const summary = `+${added.length} / -${removed.length} components, ${changed.length} changed${breaking ? " — BREAKING" : ""}`;
  return { added, removed, changed, constraintsChanged, breaking, summary };
}
