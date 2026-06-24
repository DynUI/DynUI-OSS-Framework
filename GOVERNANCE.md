# Governance

DynUI is currently maintained as a maintainer-led open source project. The goal of
this governance model is to keep decisions fast while the project is pre-1.0, and
to make expectations clear for contributors.

## Maintainer

The current maintainer is Akash Langi (`@akashlangi`). The maintainer is
responsible for:

- setting project scope and release priorities;
- reviewing and merging pull requests;
- publishing packages and releases;
- enforcing the code of conduct;
- responding to security reports;
- appointing additional maintainers when the project has sustained contributors.

## Decision Making

Most decisions are made in issues and pull requests. For routine changes, a
maintainer review and passing CI are enough.

For larger changes, open an issue first. Larger changes include:

- public API or schema changes;
- validator or safety-boundary changes;
- new runtime dependencies;
- package layout changes;
- release, security, privacy, or governance policy changes.

The maintainer has final decision authority while the project is pre-1.0. If the
project gains multiple active maintainers, this file should be updated to define a
multi-maintainer voting or consensus process.

## Contribution Terms

DynUI uses the Developer Certificate of Origin (DCO), not a Contributor License
Agreement. By contributing, you certify that you have the right to submit your
contribution under the project license.

Use a sign-off on commits:

```text
Signed-off-by: Your Name <you@example.com>
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for the contributor workflow.

## Releases

All public packages are versioned together. Releases are published from GitHub
Actions, not from a maintainer laptop. See [docs/RELEASING.md](docs/RELEASING.md).

## Security And Conduct

- Security reports follow [SECURITY.md](SECURITY.md).
- Community behavior follows [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).
- Trademark and brand usage follow [TRADEMARKS.md](TRADEMARKS.md).
