/**
 * @dynui/figma — source a ComponentManifest from a Figma design file.
 *
 *   FigmaRestClient.fetchManifest(fileKey)  // live: REST → extract → manifest
 *   extractFromFigmaFile(fileJson)          // /v1/files response → intermediate
 *   figmaToManifest(export)                 // intermediate → ComponentManifest
 *   parseAnnotation(description)            // the ```dynui contract convention
 *
 * Designers author each component's behavioral contract in its Figma description
 * (a fenced ```dynui JSON block); file-level constraints/tokens live in a
 * "@dynui/config" node. The design tool stays swappable — only the manifest is the
 * hard dependency downstream.
 */
export { FigmaRestClient } from "./rest.js";
export { extractFromFigmaFile } from "./extract.js";
export { figmaToManifest } from "./manifest.js";
export { parseAnnotation, stripAnnotation, toKebab } from "./annotations.js";
export { lintManifest, lintPassed, type LintIssue, type LintOptions } from "./lint.js";
export { diffManifest, type ManifestDiff, type ComponentChange } from "./diff.js";
export { validateFigmaFile, figmaValidationPassed, type FigmaIssue } from "./validate.js";
export type {
  DynuiAnnotation,
  FigmaManifestConfig,
  FigmaComponentInput,
  FigmaExport,
  FigmaFile,
  FigmaNode,
} from "./types.js";
