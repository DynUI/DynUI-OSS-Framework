import type { FigmaExport, FigmaFile, FigmaManifestConfig, FigmaNode } from "./types.js";

/**
 * Walk a Figma REST /v1/files response into the connector's intermediate form:
 *   - the "@dynui/config" text node → file-level config
 *   - each COMPONENT_SET → one component with its variant option names
 *   - each standalone COMPONENT → one component
 * Descriptions come from the file's `components` / `componentSets` maps.
 */
export function extractFromFigmaFile(file: FigmaFile): FigmaExport {
  let config: FigmaManifestConfig | undefined;
  const components: FigmaExport["components"] = [];

  const walk = (node: FigmaNode | undefined, parentType: string | null) => {
    if (!node) return;

    if (node.type === "TEXT" && node.name === "@dynui/config" && node.characters) {
      config = JSON.parse(node.characters) as FigmaManifestConfig;
    }

    if (node.type === "COMPONENT_SET" && node.id) {
      const variants = [
        ...new Set(
          (node.children ?? [])
            .filter((c) => c.type === "COMPONENT")
            .map((c) => (c.name ?? "").split("=").pop()!.trim())
            .filter(Boolean),
        ),
      ];
      components.push({
        name: file.componentSets?.[node.id]?.name ?? node.name ?? node.id,
        nodeId: node.id,
        description: file.componentSets?.[node.id]?.description ?? "",
        variants,
      });
      return; // variant children are not standalone components
    }

    if (node.type === "COMPONENT" && parentType !== "COMPONENT_SET" && node.id) {
      components.push({
        name: file.components?.[node.id]?.name ?? node.name ?? node.id,
        nodeId: node.id,
        description: file.components?.[node.id]?.description ?? "",
      });
    }

    for (const child of node.children ?? []) walk(child, node.type);
  };

  walk(file.document, null);

  if (!config) {
    throw new Error('No "@dynui/config" node found in the Figma file');
  }
  return { config, components };
}
