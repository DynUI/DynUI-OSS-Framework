import type { GlobalConstraints, JsonValue } from "@dynui/contracts";

/**
 * The behavioral-contract annotation a designer writes in a Figma component's
 * **description**, inside a fenced ```dynui block as JSON. Everything is optional;
 * sensible defaults are applied during mapping.
 *
 * Example (in the component description):
 *   ```dynui
 *   { "category": "chart", "audience": ["performance"],
 *     "surfaces": ["activity-detail"], "priority": 75,
 *     "showWhen": [{ "signal": "archetype.primary", "op": "eq", "value": "performance", "weight": 3 }],
 *     "data": [{ "key": "training.loadSeries", "type": "series", "required": true }],
 *     "engagementSignal": "fitness.engagement.charts.openRate" }
 *   ```
 */
export interface DynuiAnnotation {
  id?: string;
  version?: string;
  category?: string;
  intent?: string[];
  audience?: string[];
  surfaces?: string[];
  priority?: number;
  prominence?: "hero" | "primary" | "secondary" | "tertiary";
  goals?: string[];
  showWhen?: JsonValue[];
  hideWhen?: JsonValue[];
  data?: JsonValue[];
  slots?: JsonValue[];
  variants?: (string | { id: string; description?: string })[];
  engagementSignal?: string;
  experiment?: { id: string; enableForVariant: string };
}

/** File-level config, authored in a Figma node named "@dynui/config" (JSON text). */
export interface FigmaManifestConfig {
  name: string;
  version: string;
  domain?: string;
  constraints: GlobalConstraints;
  tokens?: Record<string, JsonValue>;
}

/** A single component pulled from Figma, before mapping. */
export interface FigmaComponentInput {
  name: string;
  nodeId: string;
  description: string; // may contain the ```dynui block
  variants?: string[]; // variant option names from the component set
}

/** The intermediate the connector maps into a ComponentManifest. */
export interface FigmaExport {
  config: FigmaManifestConfig;
  components: FigmaComponentInput[];
}

/** Minimal slice of the Figma REST /v1/files response that we read. */
export interface FigmaNode {
  type: string;
  name?: string;
  id?: string;
  characters?: string;
  children?: FigmaNode[];
}

export interface FigmaFile {
  name?: string;
  document: FigmaNode;
  components?: Record<string, { name: string; description?: string }>;
  componentSets?: Record<string, { name: string; description?: string }>;
}
