import type { ComponentManifest } from "@dynui/contracts";
import { extractFromFigmaFile } from "./extract.js";
import { figmaToManifest } from "./manifest.js";
import type { FigmaExport, FigmaFile } from "./types.js";

/**
 * Thin Figma REST client. Pair with a personal access token (file_content scope).
 * The full pipeline is: fetchFile → extractFromFigmaFile → figmaToManifest, exposed
 * as `fetchManifest`. (For richer per-component detail, the Figma Dev Mode MCP can
 * supplement this; the manifest shape is the same either way.)
 */
export class FigmaRestClient {
  constructor(
    private readonly token: string,
    private readonly baseURL = "https://api.figma.com",
  ) {}

  async fetchFile(fileKey: string): Promise<FigmaFile> {
    const res = await fetch(`${this.baseURL}/v1/files/${fileKey}`, {
      headers: { "X-Figma-Token": this.token },
    });
    if (!res.ok) {
      throw new Error(`Figma API HTTP ${res.status}: ${await res.text()}`);
    }
    return (await res.json()) as FigmaFile;
  }

  async fetchExport(fileKey: string): Promise<FigmaExport> {
    return extractFromFigmaFile(await this.fetchFile(fileKey));
  }

  async fetchManifest(fileKey: string): Promise<ComponentManifest> {
    return figmaToManifest(await this.fetchExport(fileKey));
  }
}
