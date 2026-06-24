/**
 * Sensitivity model for SignalProfile fields.
 *
 * DEFAULT-DENY: a signal path may only leave the trust boundary (reach the model
 * or a log) if it matches an explicit allow-prefix AND does not match a sensitive
 * namespace. Unknown namespaces are denied by default, so adding a new sensitive
 * signal can never silently leak.
 */
export interface SensitivityPolicy {
  /** Namespaces that must never leave the boundary, even if an allow-prefix matches. */
  sensitiveNamespaces: string[];
  /** Explicit allow-list of safe signal-path prefixes that MAY leave the boundary. */
  allow: string[];
}

export const defaultSensitivityPolicy: SensitivityPolicy = {
  sensitiveNamespaces: [
    "health",
    "medical",
    "diagnosis",
    "location.precise",
    "geo.precise",
    "contact",
    "email",
    "phone",
    "address",
    "payment",
    "card",
    "ssn",
    "government",
    "biometric",
  ],
  allow: [
    "archetype",
    "context.surface",
    "context.locale",
    "context.timezone",
    "context.device",
    "context.session",
    "preferences.ui",
    "preferences.fitness",
    "traits.fitness",
    "behavior.fitness",
    "cohorts",
  ],
};

const matchesPrefix = (path: string, prefixes: string[]): boolean =>
  prefixes.some((p) => path === p || path.startsWith(`${p}.`));

/** True only if `path` is explicitly allowed and not in a sensitive namespace. */
export function isAllowedSignal(path: string, policy: SensitivityPolicy = defaultSensitivityPolicy): boolean {
  if (matchesPrefix(path, policy.sensitiveNamespaces)) return false;
  return matchesPrefix(path, policy.allow);
}

/** True if a path is in a known-sensitive namespace (used by redaction). */
export function isSensitiveSignal(path: string, policy: SensitivityPolicy = defaultSensitivityPolicy): boolean {
  return matchesPrefix(path, policy.sensitiveNamespaces);
}
