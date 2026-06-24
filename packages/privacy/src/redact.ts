/**
 * Redaction for logs and error messages. Nothing that crosses into a log sink or
 * an error string should carry a raw user id, an email, an API key, or other
 * secrets — even when an upstream provider error embeds them.
 */
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const API_KEY = /\b(?:sk-(?:ant-|or-)?[A-Za-z0-9_-]{12,}|Bearer\s+[A-Za-z0-9._-]{12,})\b/g;
/** Object keys whose values are masked entirely. (anonId is NOT here — it is safe.) */
const SENSITIVE_KEY = /^(user_?id|email|phone|token|api[_-]?key|authorization|password|secret|ssn|card|account|address)$/i;

export function redactString(s: string): string {
  return s.replace(API_KEY, "[redacted-key]").replace(EMAIL, "[redacted-email]");
}

export function redactError(err: unknown): string {
  return redactString(err instanceof Error ? err.message : String(err));
}

/** Deep-redact a value: mask sensitive keys, scrub strings, tolerate cycles. */
export function redact(value: unknown, seen = new WeakSet<object>()): unknown {
  if (typeof value === "string") return redactString(value);
  if (value === null || typeof value !== "object") return value;
  if (seen.has(value as object)) return "[circular]";
  seen.add(value as object);
  if (Array.isArray(value)) return value.map((v) => redact(v, seen));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out[k] = SENSITIVE_KEY.test(k) ? "[redacted]" : redact(v, seen);
  }
  return out;
}
