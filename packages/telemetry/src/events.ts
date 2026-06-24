import type { BehaviorEvent, BehaviorEventInput } from "./types.js";

/**
 * Context shared by all events from one generated screen. `generationId` ties
 * events to a single composed screen so exposure can be deduplicated per
 * generation, and `treeKey` carries the cache key for attribution.
 */
export interface EventContext {
  anonId: string;
  surface: string;
  generationId: string;
  treeKey?: string;
  ts?: string;
}

/** A component that was actually rendered (the renderer reports these). */
export interface RenderedComponent {
  componentId: string;
  componentVersion?: string;
  experimentId?: string;
  variant?: string;
}

const ts = (ctx: EventContext) => ctx.ts ?? new Date().toISOString();

/**
 * EXPOSURE CORRECTNESS: build one exposure event per RENDERED component. The id is
 * deterministic per (generation, component), so re-reporting the same render is
 * deduplicated to once-per-component-per-generation. Suppressed components are
 * simply never in `rendered`, so they never get an exposure.
 */
export function buildExposureEvents(
  rendered: RenderedComponent[],
  ctx: EventContext,
): BehaviorEvent[] {
  return rendered.map((c) => ({
    type: "exposure",
    id: `${ctx.generationId}:${c.componentId}:exposure`,
    anonId: ctx.anonId,
    surface: ctx.surface,
    componentId: c.componentId,
    componentVersion: c.componentVersion,
    generationId: ctx.generationId,
    treeKey: ctx.treeKey,
    experimentId: c.experimentId,
    variant: c.variant,
    ts: ts(ctx),
  }));
}

/** A failed component records a render-error event — NEVER an exposure. */
export function renderErrorEvent(
  component: RenderedComponent,
  ctx: EventContext,
): BehaviorEvent {
  return {
    type: "render-error",
    id: `${ctx.generationId}:${component.componentId}:render-error`,
    anonId: ctx.anonId,
    surface: ctx.surface,
    componentId: component.componentId,
    componentVersion: component.componentVersion,
    generationId: ctx.generationId,
    treeKey: ctx.treeKey,
    experimentId: component.experimentId,
    variant: component.variant,
    ts: ts(ctx),
  };
}

/** A generation that fell back to the deterministic engine. */
export function fallbackEvent(ctx: EventContext): BehaviorEvent {
  return {
    type: "fallback",
    id: `${ctx.generationId}:fallback`,
    anonId: ctx.anonId,
    surface: ctx.surface,
    generationId: ctx.generationId,
    treeKey: ctx.treeKey,
    ts: ts(ctx),
  };
}

export const tapEvent = (component: RenderedComponent, ctx: EventContext): BehaviorEventInput => ({
  type: "tap",
  anonId: ctx.anonId,
  surface: ctx.surface,
  componentId: component.componentId,
  componentVersion: component.componentVersion,
  generationId: ctx.generationId,
  treeKey: ctx.treeKey,
  experimentId: component.experimentId,
  variant: component.variant,
});
