# Releasing

Releases are built and published by CI, not from a developer machine. This keeps
artifacts reproducible and attestable.

## Process

1. Land all changes on `main`; ensure CI (the test matrix + smoke test) is green.
2. Move the `CHANGELOG.md` **Unreleased** entries under a new version heading and
   bump the version on every public package (keep inter-package `^x.y.z` ranges in
   sync). The `0.x` line may include breaking changes in a minor — see
   [UPGRADE.md](UPGRADE.md).
3. Tag and publish a GitHub Release (`vX.Y.Z`). This triggers
   [`.github/workflows/release.yml`](../.github/workflows/release.yml):
   - re-runs typecheck / tests / schema-freshness / build / smoke on Node 22 + current
     stable;
   - publishes every public workspace via **tokenless trusted publishing**
     (`npm publish --workspaces --access public`); provenance is attached
     automatically by trusted publishing, so no `--provenance` flag and no npm token
     are used (see *Provenance & trusted publishing* below);
   - runs in the protected `release` environment (configure required reviewers and a
     tag restriction in **Settings → Environments**).

Use the **workflow_dispatch** trigger with `dry_run: true` to pack without publishing.

## Provenance & trusted publishing

This project uses **tokenless trusted publishing** (OIDC) — no long-lived npm token.
Provenance attestations are generated automatically by trusted publishing, so
artifacts are attestable without any extra flag.

Prerequisites (one-time):

- Each `packages/*/package.json` declares a `repository` field with the **exact**
  GitHub repo URL and the package `directory`. These are already set to
  `git+https://github.com/dynui/dynui.git` — **if the repo lives at a different
  org/name, update every package's `repository.url` to match before publishing**, or
  trusted publishing/provenance will reject the mismatch.
- On npmjs.com, register this repository + `.github/workflows/release.yml` as the
  **trusted publisher** for each `@dynui/*` package.
- The npm CLI trusted-publishing path requires **npm ≥ 11.5.1 and Node ≥ 22.14**. The
  `publish` job runs on Node 24 and upgrades npm to latest to satisfy this.
- The `publish` job requests `id-token: write` and runs in the protected `release`
  environment (set required reviewers + a tag restriction in **Settings →
  Environments**). No `NPM_TOKEN` secret is needed.

### Token-based alternative (only if not using trusted publishing)

Set `NPM_TOKEN` **on the `release` environment** (not as a repo secret), add
`env: { NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }} }` to the publish step, and pass
`--provenance` explicitly. Do not mix the two paths.

## Supported Node versions

CI tests **Node 22 (the declared `engines.node` minimum) and current stable (24)**. Do
not drop Node 22 coverage without bumping the declared minimum first. Note the publish
job itself runs on Node 24 because the trusted-publishing CLI path needs Node ≥ 22.14 —
this is independent of the packages' supported runtime (`engines.node >= 22`).

## Temporary manual release (fallback)

If automation is unavailable, a maintainer may publish manually as a stopgap. This
path uses a token (trusted publishing is CI-only), so pass `--provenance` explicitly:

```bash
npm install && npm run build && npm test && npm run smoke
npm publish --workspaces --provenance --access public   # requires NODE_AUTH_TOKEN / npm login
```

This is a **temporary** measure. Track migration back to the CI release workflow and
remove this fallback once trusted publishing is configured.
