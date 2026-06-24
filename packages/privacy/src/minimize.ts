import type { JsonValue, SignalProfile } from "@dynui/contracts";
import { getSignal } from "@dynui/signal";
import { type SensitivityPolicy, defaultSensitivityPolicy, isAllowedSignal } from "./sensitivity.js";

/**
 * The minimized projection of a profile that is allowed to reach the MODEL.
 * It carries NO anonId (or any subject identifier), no raw behavior map, and no
 * sensitive fields — only the archetype, safe context, and the specific allowed
 * signals the prompt needs for eligibility/ranking.
 */
export interface MinimalProfile {
  consent: { personalization: boolean };
  context: SignalProfile["context"];
  archetype?: { primary: string; confidence: number; secondary?: string };
  /** Allowed signal paths the prompt needs, resolved to values. */
  signals: Record<string, JsonValue>;
}

export interface MinimizeOptions {
  /** Signal paths the prompt needs (e.g. from component showWhen/hideWhen). */
  requiredSignals: string[];
  policy?: SensitivityPolicy;
}

export function minimizeProfileForPrompt(
  profile: SignalProfile,
  opts: MinimizeOptions,
): MinimalProfile {
  const policy = opts.policy ?? defaultSensitivityPolicy;
  const personalize = profile.consent?.personalization !== false;

  const out: MinimalProfile = {
    consent: { personalization: personalize },
    // Context is request-time and non-identifying (no anonId lives here).
    context: profile.context,
    signals: {},
  };

  if (!personalize) return out; // neutral: archetype + behavior withheld entirely

  if (profile.archetype) {
    out.archetype = {
      primary: profile.archetype.primary,
      confidence: profile.archetype.confidence,
      ...(profile.archetype.secondary ? { secondary: profile.archetype.secondary } : {}),
    };
  }

  for (const path of new Set(opts.requiredSignals)) {
    if (path.startsWith("archetype")) continue; // already represented structurally
    if (!isAllowedSignal(path, policy)) continue; // default-deny: drop sensitive/unknown
    const v = getSignal(profile, path);
    if (v !== undefined) out.signals[path] = v;
  }

  return out;
}
