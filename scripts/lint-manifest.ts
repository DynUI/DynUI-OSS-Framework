/**
 * Lint a ComponentManifest for authoring/governance problems.
 *   npm run lint:manifest            # lints the fitness example
 *   npm run lint:manifest -- path/to/manifest.json
 * Exits non-zero if there are lint ERRORS (warnings are printed but don't fail).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { migrateManifest } from "@dynui/contracts";
import { lintManifest, lintPassed } from "@dynui/figma";

const root = join(import.meta.dirname, "..");
const file = process.argv[2] ?? "examples/fitness/manifest.example.json";
const manifest = migrateManifest(JSON.parse(readFileSync(join(root, file), "utf8")));

const issues = lintManifest(manifest);
for (const i of issues) {
  const tag = i.severity === "error" ? "✗" : "•";
  console.log(`  ${tag} [${i.code}] ${i.componentId ?? ""} ${i.message}`.replace(/\s+/g, " "));
}
const errors = issues.filter((i) => i.severity === "error").length;
const warnings = issues.length - errors;
console.log(`\nlint ${file}: ${errors} error(s), ${warnings} warning(s)`);
if (!lintPassed(issues)) process.exit(1);
console.log("✓ manifest passes lint");
