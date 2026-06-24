# Go-Public Checklist

Use this checklist before making DynUI public, publishing packages, or announcing
the project. It is intentionally operational: every item should be either done,
explicitly deferred, or assigned an owner.

## Brand And Ownership

- [x] Confirm final brand: `DynUI`.
- [x] Update repository metadata, README, package descriptions, docs, examples, and
      comments to use `DynUI` consistently.
- [ ] Claim GitHub organization: `github.com/dynui`.
- [ ] Claim npm scope: `@dynui`.
- [ ] Buy primary domain, ideally `dynui.dev`.
- [ ] Buy defensive domains if available, such as `getdynui.com` and `dynui.io`.
- [ ] Claim social handles:
  - [ ] X / Twitter;
  - [ ] LinkedIn company page;
  - [ ] Bluesky;
  - [ ] Product Hunt;
  - [ ] Discord or GitHub Discussions.
- [ ] Create brand email aliases:
  - [ ] `hello@`;
  - [ ] `security@`;
  - [ ] `oss@`.
- [x] Create simple logo and favicon (`docs/brand/logo.svg`,
      `docs/brand/favicon.svg`).
- [x] Add `TRADEMARKS.md` or a brand usage note.

## Repository Hygiene

- [x] Add `SECURITY.md`.
- [x] Add `CONTRIBUTING.md`.
- [x] Add `GOVERNANCE.md`.
- [x] Add `CODE_OF_CONDUCT.md`.
- [x] Add `CHANGELOG.md` or configure Changesets.
- [x] Add issue templates.
- [x] Add pull request template.
- [x] Add `CODEOWNERS`.
- [ ] Protect `main` in GitHub settings; see `docs/BRANCH_PROTECTION.md`.
- [ ] Require CI before merge in GitHub settings; see `docs/BRANCH_PROTECTION.md`.
- [x] Decide DCO vs CLA before accepting external contributions (DCO, no CLA;
      see `GOVERNANCE.md` and `CONTRIBUTING.md`).

## README And Positioning

- [x] Rename headline to `DynUI`.
- [x] Add tagline: `Contract-validated personalized UI for modern apps.`
- [x] Add "When to use this".
- [x] Add "When not to use this".
- [x] Add visual or demo proof near the top.
- [x] Add architecture diagram.
- [x] Add safety model section.
- [x] Add package table.
- [x] Add integration boundaries:
  - [x] bring your own model provider;
  - [x] bring your own profile adapter;
  - [x] bring your own experiment system;
  - [x] bring your own telemetry sink;
  - [x] bring your own renderer.
- [x] Add production caveat: do not block render on live model generation.
- [x] Link to privacy, upgrade, quickstart, release, deployment, provider, Figma,
      experiment, renderer, and comparison docs. Pre-publish notes remain
      internal/ignored.

## Safety And Trust

- [x] Change adapter defaults to deny-by-default consent.
- [x] Make demo consent explicit in demo code.
- [x] Warn loudly for insecure anonymizer outside development and test.
- [x] Confirm no PII reaches prompts.
- [x] Confirm no raw behavior reaches prompts.
- [x] Confirm cache keys are PII-free.
- [x] Confirm no public docs mention paid tiers or commercial roadmap.
- [x] Keep `PLAN.md` ignored and private.

## Package Readiness

- [x] Confirm package names under `@dynui/*`.
- [x] Confirm package descriptions use `DynUI`.
- [x] Confirm each package has correct:
  - [x] `main`;
  - [x] `types`;
  - [x] `exports`;
  - [x] `files`;
  - [x] `engines`.
- [x] Add Node 20 and current stable Node CI matrix.
- [x] Split provider SDKs or make them optional / peer dependencies.
- [x] Ensure deterministic-only install works without model SDKs.
- [x] Add packed-package smoke test.
- [x] Confirm JSON schemas are included in package output.
- [x] Confirm no source-only path aliases leak into published packages.

## Validation And API Hardening

- [x] Add or document `validateTreeStructure`.
- [x] Add or document `validateRenderableTree`.
- [x] Make the render validation path clear in docs.
- [x] Confirm `generateScreen` always returns:
  - [x] a valid renderable tree; or
  - [x] an explicit `unrenderable` result.
- [x] Add examples showing full-context validation.
- [x] Add examples showing no-consent neutral output.

## CI And Release

- [x] `npm install`
- [x] `npm run typecheck`
- [x] `npm test`
- [x] `npm run build`
- [x] `npm run gen:schema -- --check`
- [x] `npm run lint:manifest`
- [x] `npm run eval:contracts`
- [x] `npm run eval:generation`
- [x] `npm run test:visual`
- [x] Add npm trusted publishing / provenance.
- [x] Publish from GitHub Actions, not a local machine.
- [x] Add release workflow.
- [x] Add dependency review.
- [x] Consider OpenSSF Scorecard.

## Docs And Examples

- [x] Update `docs/QUICKSTART.md` for DynUI naming.
- [x] Update `docs/PRIVACY.md`.
- [x] Update `docs/UPGRADE.md`.
- [x] Add production deployment checklist.
- [x] Add one minimal non-fitness example walkthrough.
- [x] Add Figma / export workflow docs.
- [x] Add model-provider docs.
- [x] Add deterministic-only docs.
- [x] Add experiment adapter docs.
- [x] Add renderer implementation guide.

## Launch Prep

- [ ] Create launch landing page at `dynui.dev` (draft copy in
      `docs/launch/landing-page.md`; domain/deploy still external).
- [x] Add screenshots or GIFs from the fitness demo.
- [x] Prepare launch post.
- [x] Prepare Hacker News copy.
- [x] Prepare Reddit copy.
- [x] Prepare LinkedIn copy.
- [x] Prepare short technical blog post: `Contract-validated personalized UI`.
- [x] Prepare comparison section against:
  - [x] feature flags;
  - [x] CMS tools;
  - [x] A/B testing platforms;
  - [x] server-driven UI frameworks.
- [ ] Create GitHub Discussions or Discord for feedback.
- [ ] Seed 5-10 good first issues in GitHub (drafts in
      `docs/GOOD_FIRST_ISSUES.md`; actual issue creation still external).
- [ ] Tag first release: `v0.1.0`.
- [ ] Publish npm packages.
- [ ] Announce only after install and quickstart work from a fresh clone.

## Final Gate

- [x] Fresh clone works.
- [ ] Fresh npm package install works from the public registry after publish
      (`npm run smoke` passes for packed local packages).
- [x] Demo works without API key.
- [x] Tests and evals pass.
- [x] Docs explain what DynUI is in under 30 seconds.
- [x] No private or commercial notes are public.
- [ ] Brand assets and package names are claimed (assets and package metadata are
      ready; GitHub/npm/domain/social claims are external).
- [ ] Maintainer is ready to support early users and issues for the first week
      after launch.
