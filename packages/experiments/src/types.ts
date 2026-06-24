import type { SignalCondition, SignalProfile } from "@dynui/contracts";

/**
 * A component-level experiment. The unit under test is a registered
 * component/variant (never raw model output), so outcomes are attributable.
 */
export interface ExperimentDef {
  id: string;
  description: string;
  /** Targeting: only users matching every condition are eligible. */
  segment: SignalCondition[];
  /** Fraction of eligible users entered into the experiment (0..1). Canary lever. */
  allocation: number;
  /** Variant split; weights are normalized. First variant is treated as control. */
  variants: { id: string; weight: number }[];
  /** The success metric this experiment is judged on. */
  goal: string;
  /** When the experiment started (ISO 8601) — enables the minimum-runtime guardrail. */
  startedAt?: string;
  guardrails?: {
    /** Minimum exposures per variant before a call can be made. */
    minSamplesPerVariant?: number;
    /** Minimum elapsed runtime before a call can be made (ms). */
    minRuntimeMs?: number;
    /** Sample-ratio-mismatch: fail if the SRM p-value drops below this. */
    srmMaxPValue?: number;
    /** Guardrail metrics that must not regress (lower is better). */
    metrics?: { metric: string; maxRegressionPct?: number }[];
  };
}

export interface VariantStat {
  variant: string;
  exposures: number;
  conversions: number;
  rate: number;
}

export type Recommendation = "promote" | "rollback" | "keep-running";

export interface SrmStatus {
  ok: boolean;
  pValue: number;
  observed: Record<string, number>;
}

export interface GuardrailStatus {
  ok: boolean;
  breaches: { metric: string; controlRate: number; treatmentRate: number; regressionPct: number }[];
}

export interface SegmentResult {
  control: VariantStat;
  treatment: VariantStat;
  liftPct: number;
}

export interface ExperimentResult {
  experimentId: string;
  goal: string;
  control: VariantStat;
  treatment: VariantStat;
  /** Relative lift of treatment vs control, e.g. 0.5 = +50%. */
  liftPct: number;
  /** Two-sided p-value from a two-proportion z-test. */
  pValue: number;
  significant: boolean;
  /** Enough exposures per variant for a call. */
  dataSufficient: boolean;
  /** Minimum-runtime guardrail satisfied. */
  runtimeOk: boolean;
  /** Sample-ratio-mismatch check. */
  srm: SrmStatus;
  /** Guardrail-metric check. */
  guardrails: GuardrailStatus;
  /** Per-segment breakdown, when segment data is present. */
  segments?: Record<string, SegmentResult>;
  /** Set when more than one metric is being judged (interpret with care). */
  multipleMetricsWarning?: boolean;
  recommendation: Recommendation;
  rationale: string;
}

/**
 * Where exposure/goal events are recorded. The core methods are required; segment
 * and guardrail recording are optional so a minimal sink stays simple. Swap for a
 * real store (warehouse, GrowthBook) in production.
 */
export interface EventSink {
  recordExposure(experimentId: string, variant: string, anonId: string, segment?: string): void;
  recordGoal(experimentId: string, variant: string, anonId: string, segment?: string): void;
  exposures(experimentId: string, variant: string, segment?: string): number;
  conversions(experimentId: string, variant: string, segment?: string): number;
  recordGuardrail?(experimentId: string, variant: string, anonId: string, metric: string): void;
  guardrailHits?(experimentId: string, variant: string, metric: string): number;
  segments?(experimentId: string): string[];
}

/** Export flushed rows to a warehouse / analytics store. */
export interface WarehouseExport {
  export(rows: Record<string, unknown>[]): void | Promise<void>;
}

/**
 * Assignment adapter — lets a GrowthBook/Statsig-compatible engine own bucketing.
 * The default uses the built-in deterministic hash; an adapter can defer to an
 * external SDK as long as assignment is stable for a fixed user + experiment.
 */
export interface AssignmentAdapter {
  assign(exp: ExperimentDef, profile: SignalProfile): string | null;
}
