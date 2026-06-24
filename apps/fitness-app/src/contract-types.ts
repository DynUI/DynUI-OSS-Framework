/**
 * Consumer-side mirror of the UITree contract the app renders.
 *
 * The app is a pure server-driven-UI client: it only needs the *shape* of the
 * tree it receives, not the generation packages. (In a published setup this would
 * import from `@dynui/contracts`; kept local here so the app has no build coupling
 * to the engine.)
 */
export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [k: string]: JsonValue };

export interface UINode {
  type: "screen" | "section" | "component";
  componentId?: string;
  variant?: string;
  slots?: Record<string, UINode[]>;
  props?: Record<string, JsonValue>;
  dataBindings?: Record<string, string>;
  children?: UINode[];
  label?: string;
  reason?: string;
}

export interface UITree {
  schemaVersion: string;
  surface: string;
  generatedFor: { anonId: string; archetype?: string };
  meta: {
    generatedAt: string;
    model: string;
    cacheKey: string;
    fallback: boolean;
    [k: string]: JsonValue;
  };
  root: UINode;
}

/** Shape of assets/screens.json produced by `npm run gen:screens`. */
export interface ScreensFile {
  surface: string;
  data: Record<string, JsonValue>;
  screens: Record<string, UITree>;
  /** componentId → the behavior signal its taps feed (for live attribution). */
  signalMap: Record<string, string>;
}
