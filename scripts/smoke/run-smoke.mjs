// Package publish smoke test (Phase 4).
//
// Builds the workspace, packs every public package into tarballs, installs those
// tarballs into a fresh temporary consumer project, and runs a minimal adoption flow
// (scripts/smoke/consumer-smoke.mjs) against the PACKED artifacts — not the monorepo
// source. This proves `exports`, `files`, fresh `dist`, schema inclusion, and that a
// deterministic-only consumer needs no model key and no provider SDK.
//
//   npm run smoke
//
// Runs fully offline: the only runtime deps between packages are other @dynui/*
// packages (zero third-party runtime deps), so install resolves entirely from the
// local tarballs via `overrides`.
import { execSync } from "node:child_process";
import { mkdtempSync, mkdirSync, copyFileSync, writeFileSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, "..", "..");
const run = (cmd, cwd) => execSync(cmd, { cwd, stdio: "inherit" });

const PUBLIC_PACKAGES = [
  "contracts", "signal", "validate", "generate",
  "experiments", "telemetry", "profile", "privacy", "figma", "cli",
];

function tarballName(pkgDir) {
  const { name, version } = JSON.parse(readFileSync(join(repo, "packages", pkgDir, "package.json"), "utf8"));
  return { name, file: `${name.replace("@", "").replace("/", "-")}-${version}.tgz` };
}

console.log("== build workspace ==");
run("npm run build", repo);

const work = mkdtempSync(join(tmpdir(), "dynui-smoke-"));
const tgzDir = join(work, "tarballs");
mkdirSync(tgzDir);

console.log(`\n== pack ${PUBLIC_PACKAGES.length} packages -> ${tgzDir} ==`);
for (const dir of PUBLIC_PACKAGES) {
  run(`npm pack --pack-destination "${tgzDir}"`, join(repo, "packages", dir));
}

// Sanity: the contracts tarball must include the JSON Schema files.
const contractsTgz = join(tgzDir, tarballName("contracts").file);
const listing = execSync(`tar -tzf "${contractsTgz}"`, { encoding: "utf8" });
if (!/package\/schema\/.*\.json/.test(listing)) {
  throw new Error("SMOKE FAILED: @dynui/contracts tarball is missing schema/*.json files");
}
console.log("  ✓ contracts tarball includes schema/*.json");

console.log("\n== set up consumer project ==");
const consumer = join(work, "consumer");
mkdirSync(consumer);

const deps = {};
const overrides = {};
for (const dir of PUBLIC_PACKAGES) {
  const { name, file } = tarballName(dir);
  const spec = `file:${join(tgzDir, file)}`;
  deps[name] = spec;
  overrides[name] = spec; // force transitive @dynui/* ranges onto the local tarballs
}

writeFileSync(
  join(consumer, "package.json"),
  JSON.stringify(
    { name: "dynui-consumer-smoke", private: true, version: "0.0.0", type: "module", dependencies: deps, overrides },
    null,
    2,
  ),
);

// Copy the smoke script + fixtures next to it.
copyFileSync(join(here, "consumer-smoke.mjs"), join(consumer, "consumer-smoke.mjs"));
copyFileSync(join(repo, "examples/fitness/manifest.example.json"), join(consumer, "manifest.json"));
copyFileSync(join(repo, "examples/fitness/sample-activity.json"), join(consumer, "data.json"));
copyFileSync(join(repo, "examples/fitness/signal-profile.examples.json"), join(consumer, "profiles.json"));

console.log("\n== install packed tarballs in the clean consumer ==");
// --no-audit/--no-fund for quiet; offline-friendly (no registry deps).
run("npm install --no-audit --no-fund", consumer);

// Guard: nothing should have resolved @dynui/* from a registry path.
const installed = readdirSync(join(consumer, "node_modules", "@dynui"));
for (const dir of PUBLIC_PACKAGES) {
  const short = tarballName(dir).name.split("/")[1];
  if (!installed.includes(short)) throw new Error(`SMOKE FAILED: @dynui/${short} did not install`);
}
console.log(`  ✓ installed: ${installed.map((d) => "@dynui/" + d).join(", ")}`);

console.log("\n== run the minimal adoption flow ==");
run("node consumer-smoke.mjs", consumer);

console.log("\n== exercise the dynui CLI bin ==");
run("npx --no-install dynui validate manifest.json", consumer);
run("npx --no-install dynui lint manifest.json", consumer);

console.log(`\nSMOKE PASSED. (workspace: ${work})`);
