import { createHmac } from "node:crypto";

/** Maps a real (PII) user id to a stable, opaque anonymous id. */
export type Anonymizer = (userId: string) => string;

/**
 * Salted-HMAC anonymizer. The same user + secret always yields the same id; a
 * different secret yields a different id (so ids can't be correlated across
 * deployments and can be rotated). The real user id is never recoverable from the
 * output and is never stored.
 *
 *   const anon = createHmacAnonymizer(process.env.DYNUI_ANON_SECRET!);
 *   anon("user-123") // => "anon_a1b2c3d4e5f6a7b8"
 */
export function createHmacAnonymizer(secret: string, opts?: { length?: number }): Anonymizer {
  if (!secret) throw new Error("createHmacAnonymizer requires a non-empty secret");
  const length = opts?.length ?? 16;
  return (userId: string) =>
    `anon_${createHmac("sha256", secret).update(userId).digest("hex").slice(0, length)}`;
}

/**
 * True only for local development and tests. Anything else — including a deployed
 * `NODE_ENV` (production/staging) — is treated as a non-dev environment where
 * insecure anonymization is unsafe.
 */
function isLocalDevOrTest(): boolean {
  const env = (typeof process !== "undefined" && process.env?.NODE_ENV) || "";
  return env === "" || env === "development" || env === "test";
}

let warnedInsecureAnon = false;

/**
 * Non-secret fallback anonymizer (FNV-1a). Opaque but NOT keyed, so it is only
 * suitable for local dev/tests. It is **loudly unsafe outside local development and
 * tests**: the first call under a deployed `NODE_ENV` (e.g. `production`) emits a
 * production-safety warning. Production code should use {@link createHmacAnonymizer}
 * or a caller-provided anonymizer; `BaseProfileAdapter` also warns when this default
 * is used. Set `DYNUI_ALLOW_INSECURE_ANON=1` only if you intentionally accept the
 * risk (e.g. an ephemeral preview environment).
 */
export const insecureAnonymizer: Anonymizer = (userId: string) => {
  if (
    !warnedInsecureAnon &&
    !isLocalDevOrTest() &&
    !(typeof process !== "undefined" && process.env?.DYNUI_ALLOW_INSECURE_ANON)
  ) {
    warnedInsecureAnon = true;
    console.warn(
      "[dynui] insecureAnonymizer (non-secret FNV-1a) is being used outside local " +
        "development/tests. This is UNSAFE for production: ids are not keyed and can be " +
        "correlated/brute-forced. Use createHmacAnonymizer(secret) instead. " +
        "(Set DYNUI_ALLOW_INSECURE_ANON=1 to silence if intentional.)",
    );
  }
  let h = 0x811c9dc5;
  for (let i = 0; i < userId.length; i++) {
    h ^= userId.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return `anon_${(h >>> 0).toString(16)}`;
};
