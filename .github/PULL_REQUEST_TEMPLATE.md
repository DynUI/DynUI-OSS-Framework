## Summary

<!-- What does this PR change, and why? -->

## Related issue or discussion

<!-- Link the relevant issue or discussion. Use "Closes #123" where appropriate. -->

Closes #

## Type of change

- [ ] Bug fix
- [ ] New feature
- [ ] Integration or adapter
- [ ] Documentation
- [ ] Design-system example or workflow
- [ ] Refactor / internal
- [ ] Tests or evaluation tooling
- [ ] Breaking change

## What changed

<!-- Summarise the main changes to behaviour, contracts, schemas, APIs, documentation, or developer experience. -->

-
-

## How to test

<!-- Add any additional setup or manual test steps. -->

1.
2.

## Contract, safety and governance checks

Complete the items relevant to this PR.

- [ ] Generated output remains restricted to registered components and variants.
- [ ] Invalid or off-contract UI trees are rejected or returned as explicitly non-renderable.
- [ ] Deterministic fallback behaviour remains valid.
- [ ] Consent and neutral-baseline behaviour has been considered.
- [ ] Accessibility, required-component and layout constraints remain enforced.
- [ ] No secrets, personal data or sensitive user information have been added to logs, cache keys, fixtures or examples.
- [ ] Experiment assignment and telemetry remain attributable where applicable.
- [ ] Not applicable to this change.

## Documentation and compatibility

- [ ] Relevant documentation has been updated.
- [ ] Examples or code snippets have been updated.
- [ ] Breaking changes and migration steps are documented.
- [ ] No documentation change is required.

### Compatibility impact

<!-- List affected packages, renderers, schemas, manifests, providers or examples. Write "None" where applicable. -->

## Screenshots, trees or recordings

<!-- Include before-and-after screenshots, generated UI trees, terminal output or a short recording when useful. -->

## AI-assisted contribution disclosure

<!-- AI-assisted contributions are welcome, but contributors remain responsible for understanding, reviewing and testing everything submitted. -->

- [ ] No AI tools were used to create this contribution.
- [ ] AI tools were used, and I have reviewed, understood and tested the submitted changes.

AI tools or relevant notes:

## Checklist

- [ ] `npm run typecheck` passes
- [ ] `npm test` passes, including contract and generation evaluations
- [ ] `npm run build` passes
- [ ] `npm run gen:schema -- --check` is clean, with schemas regenerated if an artefact shape changed
- [ ] Fixtures and tests have been added or updated for new validator rules or behaviour
- [ ] A `CHANGELOG.md` entry has been added under **Unreleased** for user-facing changes
- [ ] No new runtime dependency has been added to a core package; provider SDKs remain optional
- [ ] No internal planning notes have been committed
- [ ] The change is focused and does not contain unrelated modifications
- [ ] I am ready to respond to review feedback

## Notes

<!-- Anything else reviewers should know, including trade-offs, follow-ups or known limitations. -->
