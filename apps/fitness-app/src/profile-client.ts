/**
 * Thin client-side profile store: persists the user's engagement signals on the
 * device and infers which screen their accumulated behavior calls for.
 *
 * In a real deployment this would be the Profile Adapter behind a backend
 * (resolveProfile + ingestBehavior over the network). Here it persists locally so
 * the loop is demonstrable end-to-end in the app: behavior survives a reload and
 * the next launch opens on the adapted screen.
 *
 * Web uses localStorage; native would use AsyncStorage (falls back to memory).
 */
export interface PersistedProfile {
  /** Cumulative taps per engagement signal. */
  signals: Record<string, number>;
  sessions: number;
}

const KEY = "dynui.profile.v1";

const SIGNAL_TO_SCREEN: Record<string, string> = {
  "fitness.engagement.charts.openRate": "performanceAthlete",
  "fitness.engagement.insights.readRate": "casualWellness",
  "fitness.engagement.social.kudosRate": "socialCompetitive",
};

const SIGNAL_TO_LABEL: Record<string, string> = {
  "fitness.engagement.charts.openRate": "Performance",
  "fitness.engagement.insights.readRate": "Wellness",
  "fitness.engagement.social.kudosRate": "Social",
};

let memory: Record<string, string> = {};
function backing(): Pick<Storage, "getItem" | "setItem" | "removeItem"> {
  try {
    if (typeof localStorage !== "undefined") return localStorage;
  } catch {
    /* sandboxed / native — fall through */
  }
  return {
    getItem: (k: string) => (k in memory ? memory[k] : null),
    setItem: (k: string, v: string) => {
      memory[k] = v;
    },
    removeItem: (k: string) => {
      delete memory[k];
    },
  };
}

export function loadProfile(): PersistedProfile {
  try {
    const raw = backing().getItem(KEY);
    if (raw) return JSON.parse(raw) as PersistedProfile;
  } catch {
    /* ignore */
  }
  return { signals: {}, sessions: 0 };
}

function save(p: PersistedProfile) {
  try {
    backing().setItem(KEY, JSON.stringify(p));
  } catch {
    /* ignore */
  }
}

/** Add this session's per-signal taps into the persisted profile. */
export function recordSignalTaps(delta: Record<string, number>) {
  const p = loadProfile();
  for (const [sig, n] of Object.entries(delta)) {
    p.signals[sig] = (p.signals[sig] ?? 0) + n;
  }
  save(p);
}

/** Count a launch. Returns the new session number. */
export function bumpSession(): number {
  const p = loadProfile();
  p.sessions += 1;
  save(p);
  return p.sessions;
}

export function resetProfile() {
  try {
    backing().removeItem(KEY);
  } catch {
    /* ignore */
  }
  memory = {};
}

/** The screen key the accumulated behavior calls for (null = new user). */
export function inferScreenKey(p: PersistedProfile): string | null {
  const top = topSignal(p);
  return top ? SIGNAL_TO_SCREEN[top] : null;
}

export function inferLabel(p: PersistedProfile): string | null {
  const top = topSignal(p);
  return top ? SIGNAL_TO_LABEL[top] : null;
}

function topSignal(p: PersistedProfile): string | null {
  let best: string | null = null;
  let bestV = 0;
  for (const [sig, v] of Object.entries(p.signals)) {
    if (v > bestV) {
      bestV = v;
      best = sig;
    }
  }
  return best;
}
