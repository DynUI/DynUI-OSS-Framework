import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname } from "node:path";
import type { JsonValue, SignalProfile } from "@dynui/contracts";

/**
 * What we persist per user. Keyed by anonId (a hash), never raw PII. Behavior
 * accumulates across sessions; session count + lastSeen track recency.
 */
export interface StoredProfile {
  behavior: Record<string, number>;
  preferences: Record<string, JsonValue>;
  traits: Record<string, JsonValue>;
  sessionCount: number;
  lastSeen?: string;
  /**
   * Persisted consent. Absent until the app sets it (via `setConsent` or
   * `ResolveContext.consent`); the adapter falls back to its configured default
   * while this is undefined.
   */
  consent?: SignalProfile["consent"];
}

export const emptyStored = (): StoredProfile => ({
  behavior: {},
  preferences: {},
  traits: {},
  sessionCount: 0,
});

export interface ProfileStore {
  load(anonId: string): StoredProfile | undefined;
  save(anonId: string, profile: StoredProfile): void;
}

/** Volatile store — fine for tests and single-process use. */
export class InMemoryProfileStore implements ProfileStore {
  private map = new Map<string, StoredProfile>();
  load(anonId: string) {
    return this.map.get(anonId);
  }
  save(anonId: string, profile: StoredProfile) {
    this.map.set(anonId, profile);
  }
}

/**
 * JSON-file store — persists across process restarts, so a brand-new adapter
 * instance still sees what a previous session wrote. Stands in for a real
 * database / key-value store behind the same interface.
 */
export class FileProfileStore implements ProfileStore {
  constructor(private readonly path: string) {}

  private readAll(): Record<string, StoredProfile> {
    if (!existsSync(this.path)) return {};
    try {
      return JSON.parse(readFileSync(this.path, "utf8")) as Record<string, StoredProfile>;
    } catch {
      return {};
    }
  }

  load(anonId: string) {
    return this.readAll()[anonId];
  }

  save(anonId: string, profile: StoredProfile) {
    const all = this.readAll();
    all[anonId] = profile;
    mkdirSync(dirname(this.path), { recursive: true });
    writeFileSync(this.path, JSON.stringify(all, null, 2));
  }
}
