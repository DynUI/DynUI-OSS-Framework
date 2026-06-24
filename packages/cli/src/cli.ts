#!/usr/bin/env node
/**
 * dynui — a small, file-based developer CLI.
 *
 * It is intentionally NOT a management console: no network, no state, no config. It
 * wraps the same public functions adopters would call in code, so a project can
 * validate and lint manifests (and read the shipped JSON Schemas) without writing
 * TypeScript.
 *
 *   dynui validate <manifest.json>            parse + schema-validate a manifest
 *   dynui validate-tree <tree.json> <m.json>  STRUCTURAL UITree validation
 *   dynui lint <manifest.json>                governance lint (non-zero on errors)
 *   dynui schema [<artifact>]                 print a shipped JSON Schema (or list)
 *   dynui --help                              usage
 *   dynui --version                           CLI version
 *
 * Repo-level checks (eval:contracts, eval:generation, schema freshness) are npm
 * scripts in the framework repo; see CONTRIBUTING.md.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createRequire } from "node:module";
import { parseComponentManifest, parseUITree } from "@dynui/contracts";
import { lintManifest, lintPassed } from "@dynui/figma";
import { validateTreeStructure } from "@dynui/validate";

const require = createRequire(import.meta.url);
const pkg = require("../package.json") as { version: string };

const SCHEMAS: Record<string, string> = {
  "component-manifest": "component-manifest.schema.json",
  "signal-profile": "signal-profile.schema.json",
  "ui-tree": "ui-tree.schema.json",
  "generation-request": "generation-request.schema.json",
  "behavior-event": "behavior-event.schema.json",
  "experiment-def": "experiment-def.schema.json",
  "signal-model": "signal-model.schema.json",
};

const USAGE = `dynui ${pkg.version} — DynUI developer CLI

Usage:
  dynui validate <manifest.json>             Parse + schema-validate a manifest
  dynui validate-tree <tree.json> <m.json>   Structural UITree validation (NOT the
                                             full render gate — that needs request
                                             context: consent, data, surface)
  dynui lint <manifest.json>                 Governance lint a manifest (non-zero on errors)
  dynui schema [<artifact>]                  Print a shipped JSON Schema, or list artifacts
  dynui --help | --version

Artifacts: ${Object.keys(SCHEMAS).join(", ")}
`;

function readJson(file: string): unknown {
  const path = resolve(process.cwd(), file);
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (e) {
    fail(`could not read JSON from ${file}: ${(e as Error).message}`);
  }
}

function fail(msg: string): never {
  console.error(`dynui: ${msg}`);
  process.exit(1);
}

function requireArg(arg: string | undefined, what: string): string {
  if (!arg) fail(`missing ${what}. Run 'dynui --help'.`);
  return arg;
}

function cmdValidate(file: string): void {
  const result = parseComponentManifest(readJson(file));
  if (result.ok) {
    console.log(`✓ ${file} is a valid component manifest (${result.value.registry.name} v${result.value.registry.version})`);
    return;
  }
  console.error(`✗ ${file} is not a valid component manifest:`);
  for (const issue of result.issues) {
    console.error(`  [${issue.code}] ${issue.path}: ${issue.message}`);
  }
  process.exit(1);
}

function cmdValidateTree(treeFile: string, manifestFile: string): void {
  const m = parseComponentManifest(readJson(manifestFile));
  if (!m.ok) fail(`${manifestFile} is not a valid manifest — run 'dynui validate ${manifestFile}' first.`);
  const t = parseUITree(readJson(treeFile));
  if (!t.ok) {
    console.error(`✗ ${treeFile} is not a structurally valid UITree:`);
    for (const issue of t.issues) console.error(`  [${issue.code}] ${issue.path}: ${issue.message}`);
    process.exit(1);
  }
  const result = validateTreeStructure(t.value, m.value);
  if (result.ok) {
    console.log(`✓ ${treeFile} passes STRUCTURAL validation against ${manifestFile}`);
    console.log("  note: this is not the render gate — use validateRenderableTree(...) in code,");
    console.log("  which additionally enforces consent, data, surface, and experiment rules.");
    return;
  }
  console.error(`✗ ${treeFile} failed structural validation:`);
  for (const e of result.errors) console.error(`  [${e.code}] ${e.nodePath}: ${e.message}`);
  process.exit(1);
}

function cmdLint(file: string): void {
  const result = parseComponentManifest(readJson(file));
  if (!result.ok) fail(`${file} is not a valid manifest — run 'dynui validate ${file}' first.`);
  const issues = lintManifest(result.value);
  if (issues.length === 0) {
    console.log(`✓ ${file} passed lint with no issues`);
    return;
  }
  for (const i of issues) {
    const where = i.componentId ? ` (${i.componentId})` : "";
    console.error(`  ${i.severity === "error" ? "✗" : "⚠"} [${i.code}]${where} ${i.message}`);
  }
  const errors = issues.filter((i) => i.severity === "error").length;
  const warnings = issues.length - errors;
  console.error(`\n${errors} error(s), ${warnings} warning(s)`);
  if (!lintPassed(issues)) process.exit(1);
}

function cmdSchema(name: string | undefined): void {
  if (!name) {
    console.log("Available schemas:");
    for (const k of Object.keys(SCHEMAS)) console.log(`  ${k}`);
    return;
  }
  const file = SCHEMAS[name];
  if (!file) fail(`unknown artifact '${name}'. One of: ${Object.keys(SCHEMAS).join(", ")}`);
  // The JSON Schemas are shipped with @dynui/contracts (exports "./schema/*.json").
  const schemaPath = require.resolve(`@dynui/contracts/schema/${file}`);
  process.stdout.write(readFileSync(schemaPath, "utf8"));
}

function main(argv: string[]): void {
  const [cmd, ...rest] = argv;
  switch (cmd) {
    case "validate":
      return cmdValidate(requireArg(rest[0], "<manifest.json>"));
    case "validate-tree":
      return cmdValidateTree(
        requireArg(rest[0], "<tree.json>"),
        requireArg(rest[1], "<manifest.json>"),
      );
    case "lint":
      return cmdLint(requireArg(rest[0], "<manifest.json>"));
    case "schema":
      return cmdSchema(rest[0]);
    case "--version":
    case "-v":
      console.log(pkg.version);
      return;
    case undefined:
    case "--help":
    case "-h":
    case "help":
      console.log(USAGE);
      return;
    default:
      fail(`unknown command '${cmd}'. Run 'dynui --help'.`);
  }
}

main(process.argv.slice(2));
