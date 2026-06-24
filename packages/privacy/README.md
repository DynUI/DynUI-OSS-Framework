# @dynui/privacy

Privacy primitives enforced across the framework. See [docs/PRIVACY.md](../../docs/PRIVACY.md).

## API
- `createHmacAnonymizer(secret)` / `insecureAnonymizer` — map a real user id to a
  stable, opaque `anonId` (salted HMAC in prod; the FNV default is dev-only).
- `defaultSensitivityPolicy`, `isAllowedSignal(path, policy)`,
  `isSensitiveSignal(path, policy)` — **default-deny** model for which signal paths
  may leave the trust boundary.
- `minimizeProfileForPrompt(profile, { requiredSignals, policy })` — the reduced
  projection the model may receive: no identifiers, no raw behavior, no sensitive
  fields — only the archetype + allowed required signals.
- `redact`, `redactString`, `redactError` — mask user ids, emails, API keys, and
  sensitive fields in logs/errors.
- `personalizationAllowed`, `analyticsAllowed`, `trainingAllowed` — read consent the
  same way everywhere.
