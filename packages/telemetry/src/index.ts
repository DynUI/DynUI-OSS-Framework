/**
 * @dynui/telemetry — closes the loop.
 *
 *   - BehaviorEvent / EventLogger : the client emits exposure/tap/dwell/goal events
 *   - BatchingLogger + sinks      : buffer and ship them
 *   - aggregateBehavior           : events → SignalProfile.behavior signals
 *   - inferArchetype / applyBehavior : signals → archetype → updated profile
 *
 * The updated profile feeds the next generation, so the UI adapts to how the user
 * actually behaves.
 */
export type {
  BehaviorEvent,
  BehaviorEventInput,
  BehaviorEventType,
  EventLogger,
  EventTransport,
} from "./types.js";
export { BatchingLogger, arraySink, consoleSink, markTraining } from "./logger.js";
export {
  type EventContext,
  type RenderedComponent,
  buildExposureEvents,
  renderErrorEvent,
  fallbackEvent,
  tapEvent,
} from "./events.js";
export {
  aggregateBehavior,
  inferArchetype,
  applyBehavior,
  DEFAULT_FITNESS_SIGNAL_MODEL,
} from "./aggregate.js";
