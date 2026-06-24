import type {
  ComponentDef,
  ComponentManifest,
  DataRequirement,
  SignalCondition,
  SlotDef,
  VariantDef,
} from "@dynui/contracts";
import { parseAnnotation, stripAnnotation, toKebab } from "./annotations.js";
import type { FigmaExport } from "./types.js";

/**
 * Map an extracted Figma export into a ComponentManifest. The behavioral contract
 * comes from each component's ```dynui annotation; variants come from the Figma
 * component-set variant options; file-level constraints/tokens come from config.
 *
 * The output is an ordinary ComponentManifest — feed it straight to generation.
 */
export function figmaToManifest(exp: FigmaExport): ComponentManifest {
  const components: ComponentDef[] = exp.components.map((c) => {
    const a = parseAnnotation(c.description);

    const variants: VariantDef[] = (c.variants ?? a.variants ?? []).map((v) =>
      typeof v === "string" ? { id: v, description: "" } : { description: "", ...v },
    );

    const def: ComponentDef = {
      id: a.id ?? toKebab(c.name),
      name: c.name,
      version: a.version ?? "0.1.0",
      figmaNodeId: c.nodeId,
      category: a.category ?? "metric",
      description: stripAnnotation(c.description),
      intent: a.intent ?? [],
      variants,
      slots: (a.slots ?? []) as unknown as SlotDef[],
      data: (a.data ?? []) as unknown as DataRequirement[],
      contract: {
        audience: a.audience ?? ["*"],
        surfaces: a.surfaces ?? [],
        showWhen: a.showWhen as unknown as SignalCondition[] | undefined,
        hideWhen: a.hideWhen as unknown as SignalCondition[] | undefined,
        priority: a.priority ?? 0,
        prominence: a.prominence,
        goals: a.goals,
      },
    };
    if (a.engagementSignal) def.engagementSignal = a.engagementSignal;
    if (a.experiment) def.experiment = a.experiment;
    return def;
  });

  return {
    schemaVersion: "component-manifest/1.0",
    registry: { name: exp.config.name, version: exp.config.version, domain: exp.config.domain },
    components,
    constraints: exp.config.constraints,
    tokens: exp.config.tokens,
  };
}
