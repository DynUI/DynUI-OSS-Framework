/**
 * @dynui/privacy — privacy primitives shared across the framework.
 *
 * - anonymize: salted-HMAC (or caller-provided) user-id anonymization
 * - sensitivity: default-deny model for which signal paths may leave the boundary
 * - minimize: the reduced profile projection that is allowed to reach the model
 * - redact: log/error redaction (user ids, emails, API keys, sensitive fields)
 * - consent: the single source of truth for reading consent
 */
export { type Anonymizer, createHmacAnonymizer, insecureAnonymizer } from "./anonymize.js";
export {
  type SensitivityPolicy,
  defaultSensitivityPolicy,
  isAllowedSignal,
  isSensitiveSignal,
} from "./sensitivity.js";
export {
  type MinimalProfile,
  type MinimizeOptions,
  minimizeProfileForPrompt,
} from "./minimize.js";
export { redact, redactString, redactError } from "./redact.js";
export { sanitizeTreeForPrompt } from "./sanitize.js";
export { personalizationAllowed, analyticsAllowed, trainingAllowed } from "./consent.js";
