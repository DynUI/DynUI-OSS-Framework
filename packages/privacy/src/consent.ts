import type { SignalProfile } from "@dynui/contracts";

/**
 * Consent predicates. The framework reads consent the same way everywhere so a
 * single profile can't be treated as consenting in one path and not another.
 */

/** May we tailor the UI (archetype/behavior/trait targeting)? */
export const personalizationAllowed = (p: SignalProfile): boolean =>
  p.consent?.personalization !== false;

/** May we capture behavior events and ingest behavior deltas? */
export const analyticsAllowed = (p: SignalProfile): boolean => p.consent?.analytics !== false;

/** May anonymized outcomes feed model training? Opt-IN: must be explicitly true. */
export const trainingAllowed = (p: SignalProfile): boolean => p.consent?.modelTraining === true;
