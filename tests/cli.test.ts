import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { join } from "node:path";

const root = join(import.meta.dirname, "..");
const CLI = join(root, "packages/cli/src/cli.ts");
const MANIFEST = join(root, "examples/fitness/manifest.example.json");
const VALID_TREE = join(root, "tests/fixtures/trees/valid/flat-performance.json");

/** Run the CLI through tsx; return { status, stdout, stderr }. */
function dynui(args: string[]): { status: number; stdout: string; stderr: string } {
  try {
    const stdout = execFileSync(process.execPath, ["--import", "tsx", CLI, ...args], {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { status: 0, stdout, stderr: "" };
  } catch (e) {
    const err = e as { status?: number; stdout?: Buffer | string; stderr?: Buffer | string };
    return {
      status: err.status ?? 1,
      stdout: String(err.stdout ?? ""),
      stderr: String(err.stderr ?? ""),
    };
  }
}

test("dynui validate passes for a valid manifest", () => {
  const r = dynui(["validate", MANIFEST]);
  assert.equal(r.status, 0);
  assert.match(r.stdout, /valid component manifest/);
});

test("dynui validate exits non-zero for an invalid manifest", () => {
  const r = dynui(["validate", VALID_TREE]); // a tree is not a manifest
  assert.equal(r.status, 1);
});

test("dynui lint passes for the reference manifest", () => {
  const r = dynui(["lint", MANIFEST]);
  assert.equal(r.status, 0);
});

test("dynui validate-tree structurally validates a tree", () => {
  const r = dynui(["validate-tree", VALID_TREE, MANIFEST]);
  assert.equal(r.status, 0);
  assert.match(r.stdout, /STRUCTURAL validation/);
});

test("dynui schema prints a JSON Schema document", () => {
  const r = dynui(["schema", "component-manifest"]);
  assert.equal(r.status, 0);
  const doc = JSON.parse(r.stdout);
  assert.equal(doc.title, "ComponentManifest");
});

test("dynui schema with no arg lists available artifacts", () => {
  const r = dynui(["schema"]);
  assert.equal(r.status, 0);
  assert.match(r.stdout, /component-manifest/);
});

test("dynui rejects an unknown command", () => {
  const r = dynui(["frobnicate"]);
  assert.equal(r.status, 1);
});
