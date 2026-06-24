# Production Deployment Checklist

Use this checklist before connecting DynUI to real users. DynUI is self-hosted:
your application owns the renderer, profile store, model endpoint, telemetry sink,
and experiment system.

## Manifest And Renderer

- [ ] Manifest parses with `migrateManifest`.
- [ ] Manifest lint passes with `lintManifest`.
- [ ] Manifest diff is reviewed with `diffManifest` before rollout.
- [ ] Renderer compatibility passes with `checkRendererCompat`.
- [ ] Every component has an error boundary or equivalent isolation.
- [ ] Unknown components render a safe fallback, not a blank screen.

## Consent And Privacy

- [ ] `DYNUI_ANON_SECRET` is set and rotated through your secret manager.
- [ ] Profile adapter uses `createHmacAnonymizer`.
- [ ] Consent is captured before personalization.
- [ ] `personalization:false` produces a neutral screen.
- [ ] `analytics:false` prevents telemetry capture and behavior ingestion.
- [ ] `modelTraining:false` is honored by downstream export or training jobs.
- [ ] Logs and provider errors pass through `redact` / `redactError`.
- [ ] Cache keys are confirmed PII-free.

## Generation

- [ ] Request-time paths use deterministic generation or cached trees.
- [ ] Live model calls, if used, run in background or session-boundary flows.
- [ ] Live model calls have a `timeoutMs` budget.
- [ ] Fallback behavior is tested for provider timeout, malformed output, and
      validation failure.
- [ ] Callers branch on `res.unrenderable` and never render invalid trees.
- [ ] Custom or cached trees are gated with `validateRenderableTree`.

## Experiments And Telemetry

- [ ] Experiment assignments are stable for a user/profile.
- [ ] Exposures are recorded only for rendered components.
- [ ] Goal events are tied to registered component or variant ids.
- [ ] Promotion/rollback decisions require sample size, runtime, SRM, and guardrail
      checks.
- [ ] Telemetry sink retention and export policy is documented by your app.

## CI Gate

Require these before release:

```bash
npm install
npm run typecheck
npm test
npm run build
npm run gen:schema -- --check
npm run lint:manifest
npm run eval:contracts
npm run eval:generation
npm run test:visual
npm run smoke
```

For hosted GitHub settings, see [BRANCH_PROTECTION.md](BRANCH_PROTECTION.md).
