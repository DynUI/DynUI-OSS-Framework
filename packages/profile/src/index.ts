/**
 * @dynui/profile — the Profile Adapter seam.
 *
 *   - BaseProfileAdapter        : resolve a SignalProfile + persist behavior
 *   - InMemoryProfileStore      : volatile store (tests, single process)
 *   - FileProfileStore          : survives restarts (stands in for a real DB)
 *   - anonIdFor                 : derive an opaque id — no PII persisted
 *
 * Behavior aggregated by @dynui/telemetry is ingested here so it compounds across
 * sessions and shapes the next resolveProfile — the durable, cross-session loop.
 */
export {
  BaseProfileAdapter,
  anonIdFor,
  DENY_ALL_CONSENT,
  DEV_DEFAULT_CONSENT,
  type Consent,
} from "./adapter.js";
export {
  InMemoryProfileStore,
  FileProfileStore,
  emptyStored,
  type ProfileStore,
  type StoredProfile,
} from "./store.js";
