# Security Policy

DynUI is a self-hosted framework. It ships no hosted service, no managed
model, and no managed registry. Most security-relevant behavior runs inside *your*
deployment, so the boundaries below matter when you assess risk.

## Supported Versions

The project is pre-1.0 (`0.x`). During the `0.x` series, security fixes are
applied to the latest released minor version only. Once `1.0` ships, this section
will list the supported version range.

| Version | Supported |
|---------|-----------|
| `0.1.x` | ✅ (latest) |
| `< 0.1` | ❌ |

## Reporting a Vulnerability

**Do not open a public issue for security problems.**

Report vulnerabilities privately via GitHub's
[private vulnerability reporting](https://docs.github.com/en/code-security/security-advisories/guidance-on-reporting-and-writing-information-about-vulnerabilities/privately-reporting-a-security-vulnerability)
("Report a vulnerability" on the repository **Security** tab). If that is
unavailable, email the maintainer at **langiakash@gmail.com** with `SECURITY` in
the subject.

Please include:

- a description of the issue and its impact;
- the affected package(s) and version(s);
- reproduction steps or a proof of concept;
- any suggested remediation.

### Response Window

- **Acknowledgement:** within 5 business days.
- **Triage and severity assessment:** within 10 business days.
- **Fix or mitigation plan:** communicated after triage; timelines depend on
  severity and complexity.

We will credit reporters who wish to be acknowledged once a fix is released.

## Privacy and Consent Issues

DynUI enforces consent and data minimization in code (see
[docs/PRIVACY.md](docs/PRIVACY.md)). Treat the following as security-class issues
and report them through the private channel above:

- a path where a non-consenting user is personalized;
- a path where analytics/behavior is captured without consent;
- a path where identifiers, raw behavior, or sensitive fields reach a model
  prompt, a log, or an error;
- a validation bypass that lets an off-contract or consent-violating tree render.

## Model Providers Are Deployment-Owned

DynUI does **not** bundle or operate a model. You bring your own
`ModelProvider` (Anthropic, an OpenAI-compatible endpoint, or a custom one). The
security, data handling, retention, and compliance posture of any model endpoint
you connect is **owned by your deployment**, not by this project. Live model
generation is optional; the deterministic engine runs with no provider at all.

## Scope

In scope: the published `@dynui/*` packages, their schemas, validators, generation
orchestration, privacy/consent enforcement, and the documented integration seams.

Out of scope: the reference `apps/fitness-app` demo renderer (illustrative only),
third-party model endpoints, and any hosted/managed service (none is provided by
this project).
