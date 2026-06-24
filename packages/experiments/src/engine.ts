import type { ExperimentAssignment, SignalProfile } from "@dynui/contracts";
import { assignVariant } from "./assign.js";
import { srmPValue, twoProportionPValue } from "./stats.js";
import type {
  AssignmentAdapter,
  EventSink,
  ExperimentDef,
  ExperimentResult,
  GuardrailStatus,
  Recommendation,
  SegmentResult,
  SrmStatus,
  VariantStat,
} from "./types.js";

/** Default in-memory event store. Swap for a real sink (warehouse, GrowthBook) in prod. */
export class InMemoryEventSink implements EventSink {
  private exp = new Map<string, Set<string>>();
  private goalSet = new Map<string, Set<string>>();
  private guard = new Map<string, Set<string>>();
  private seen = new Map<string, Set<string>>(); // experimentId -> segments seen
  private key = (...parts: string[]) => parts.join("|");

  private add(map: Map<string, Set<string>>, k: string, anonId: string) {
    (map.get(k) ?? map.set(k, new Set()).get(k)!).add(anonId);
  }

  recordExposure(experimentId: string, variant: string, anonId: string, segment?: string) {
    this.add(this.exp, this.key(experimentId, variant), anonId);
    if (segment) {
      this.add(this.exp, this.key(experimentId, variant, segment), anonId);
      this.add(this.seen, experimentId, segment);
    }
  }
  recordGoal(experimentId: string, variant: string, anonId: string, segment?: string) {
    this.add(this.goalSet, this.key(experimentId, variant), anonId);
    if (segment) this.add(this.goalSet, this.key(experimentId, variant, segment), anonId);
  }
  recordGuardrail(experimentId: string, variant: string, anonId: string, metric: string) {
    this.add(this.guard, this.key(experimentId, variant, metric), anonId);
  }
  exposures(experimentId: string, variant: string, segment?: string) {
    return this.exp.get(this.key(experimentId, variant, ...(segment ? [segment] : [])))?.size ?? 0;
  }
  conversions(experimentId: string, variant: string, segment?: string) {
    return this.goalSet.get(this.key(experimentId, variant, ...(segment ? [segment] : [])))?.size ?? 0;
  }
  guardrailHits(experimentId: string, variant: string, metric: string) {
    return this.guard.get(this.key(experimentId, variant, metric))?.size ?? 0;
  }
  segments(experimentId: string) {
    return [...(this.seen.get(experimentId) ?? [])];
  }
}

/** Built-in deterministic assignment, wrapped as an adapter. */
const builtinAdapter: AssignmentAdapter = { assign: (exp, profile) => assignVariant(exp, profile) };

/**
 * The `ComponentExperiment` abstraction: assign users, log outcomes, and turn the
 * numbers into a promote / rollback / keep-running decision — but ONLY when
 * exposure, assignment, runtime, SRM, sample sufficiency, and guardrail checks all
 * pass. Assignment can be delegated to an external engine via an AssignmentAdapter.
 */
export class ComponentExperimentEngine {
  private readonly adapter: AssignmentAdapter;

  constructor(
    private readonly experiments: ExperimentDef[],
    public readonly sink: EventSink = new InMemoryEventSink(),
    opts: { assignmentAdapter?: AssignmentAdapter } = {},
  ) {
    this.adapter = opts.assignmentAdapter ?? builtinAdapter;
  }

  get(experimentId: string): ExperimentDef | undefined {
    return this.experiments.find((e) => e.id === experimentId);
  }

  /** Assignment for a single experiment (null = not in it). */
  assign(experimentId: string, profile: SignalProfile): string | null {
    const exp = this.get(experimentId);
    return exp ? this.adapter.assign(exp, profile) : null;
  }

  /** All assignments for a profile, in the shape generation consumes. */
  assignmentsFor(profile: SignalProfile): ExperimentAssignment[] {
    const out: ExperimentAssignment[] = [];
    for (const exp of this.experiments) {
      const variant = this.adapter.assign(exp, profile);
      if (variant) out.push({ experimentId: exp.id, variant });
    }
    return out;
  }

  recordExposure(experimentId: string, variant: string, anonId: string, segment?: string) {
    this.sink.recordExposure(experimentId, variant, anonId, segment);
  }
  recordGoal(experimentId: string, variant: string, anonId: string, segment?: string) {
    this.sink.recordGoal(experimentId, variant, anonId, segment);
  }

  /** Compare the treatment to control and recommend an action. */
  analyze(experimentId: string, opts: { now?: number } = {}): ExperimentResult {
    const exp = this.get(experimentId);
    if (!exp) throw new Error(`Unknown experiment '${experimentId}'`);
    const [controlV, treatmentV] = exp.variants;
    if (!controlV || !treatmentV) {
      throw new Error(`Experiment '${experimentId}' needs a control and a treatment`);
    }

    const stat = (variant: string, segment?: string): VariantStat => {
      const exposures = this.sink.exposures(experimentId, variant, segment);
      const conversions = this.sink.conversions(experimentId, variant, segment);
      return { variant, exposures, conversions, rate: exposures ? conversions / exposures : 0 };
    };

    const control = stat(controlV.id);
    const treatment = stat(treatmentV.id);
    const liftPct = control.rate ? (treatment.rate - control.rate) / control.rate : 0;
    const pValue = twoProportionPValue(control.conversions, control.exposures, treatment.conversions, treatment.exposures);
    const significant = pValue < 0.05;

    const minN = exp.guardrails?.minSamplesPerVariant ?? 0;
    const dataSufficient = control.exposures >= minN && treatment.exposures >= minN;

    // Minimum runtime.
    let runtimeOk = true;
    if (exp.guardrails?.minRuntimeMs != null && exp.startedAt) {
      const elapsed = (opts.now ?? Date.now()) - new Date(exp.startedAt).getTime();
      runtimeOk = elapsed >= exp.guardrails.minRuntimeMs;
    }

    // Sample-ratio mismatch.
    const srm = this.checkSrm(exp, control, treatment);

    // Guardrail metrics (lower is better; treatment regressing => breach).
    const guardrails = this.checkGuardrails(exp, control, treatment);

    // Segment breakdown.
    const segments = this.segmentBreakdown(experimentId, controlV.id, treatmentV.id);

    const multipleMetricsWarning = (exp.guardrails?.metrics?.length ?? 0) > 0 ? true : undefined;

    const { recommendation, rationale } = decide({
      exp,
      control,
      treatment,
      liftPct,
      pValue,
      significant,
      dataSufficient,
      runtimeOk,
      srm,
      guardrails,
      minN,
    });

    return {
      experimentId,
      goal: exp.goal,
      control,
      treatment,
      liftPct,
      pValue,
      significant,
      dataSufficient,
      runtimeOk,
      srm,
      guardrails,
      ...(segments ? { segments } : {}),
      ...(multipleMetricsWarning ? { multipleMetricsWarning } : {}),
      recommendation,
      rationale,
    };
  }

  private checkSrm(exp: ExperimentDef, control: VariantStat, treatment: VariantStat): SrmStatus {
    const [cW, tW] = exp.variants.map((v) => v.weight);
    const pValue = srmPValue([control.exposures, treatment.exposures], [cW, tW]);
    const threshold = exp.guardrails?.srmMaxPValue;
    const ok = threshold == null ? true : pValue >= threshold;
    return { ok, pValue, observed: { [control.variant]: control.exposures, [treatment.variant]: treatment.exposures } };
  }

  private checkGuardrails(exp: ExperimentDef, control: VariantStat, treatment: VariantStat): GuardrailStatus {
    const breaches: GuardrailStatus["breaches"] = [];
    for (const g of exp.guardrails?.metrics ?? []) {
      if (!this.sink.guardrailHits) break;
      const cHits = this.sink.guardrailHits(exp.id, control.variant, g.metric);
      const tHits = this.sink.guardrailHits(exp.id, treatment.variant, g.metric);
      const cRate = control.exposures ? cHits / control.exposures : 0;
      const tRate = treatment.exposures ? tHits / treatment.exposures : 0;
      const tolerance = g.maxRegressionPct ?? 0.1;
      const regressionPct = cRate ? (tRate - cRate) / cRate : tRate > 0 ? Infinity : 0;
      if (regressionPct > tolerance) breaches.push({ metric: g.metric, controlRate: cRate, treatmentRate: tRate, regressionPct });
    }
    return { ok: breaches.length === 0, breaches };
  }

  private segmentBreakdown(experimentId: string, controlId: string, treatmentId: string): Record<string, SegmentResult> | undefined {
    if (!this.sink.segments) return undefined;
    const segs = this.sink.segments(experimentId);
    if (segs.length === 0) return undefined;
    const out: Record<string, SegmentResult> = {};
    const stat = (variant: string, segment: string): VariantStat => {
      const exposures = this.sink.exposures(experimentId, variant, segment);
      const conversions = this.sink.conversions(experimentId, variant, segment);
      return { variant, exposures, conversions, rate: exposures ? conversions / exposures : 0 };
    };
    for (const seg of segs) {
      const c = stat(controlId, seg);
      const t = stat(treatmentId, seg);
      out[seg] = { control: c, treatment: t, liftPct: c.rate ? (t.rate - c.rate) / c.rate : 0 };
    }
    return out;
  }
}

function decide(ctx: {
  exp: ExperimentDef;
  control: VariantStat;
  treatment: VariantStat;
  liftPct: number;
  pValue: number;
  significant: boolean;
  dataSufficient: boolean;
  runtimeOk: boolean;
  srm: SrmStatus;
  guardrails: GuardrailStatus;
  minN: number;
}): { recommendation: Recommendation; rationale: string } {
  const { exp, control, treatment, liftPct, pValue, significant, dataSufficient, runtimeOk, srm, guardrails, minN } = ctx;

  // A guardrail breach is a hard rollback (regardless of the primary metric).
  if (dataSufficient && !guardrails.ok) {
    const b = guardrails.breaches[0];
    return { recommendation: "rollback", rationale: `Guardrail '${b.metric}' regressed ${(b.regressionPct * 100).toFixed(1)}% in treatment.` };
  }
  if (!dataSufficient) {
    return { recommendation: "keep-running", rationale: `Below ${minN} exposures per variant — not enough data to decide.` };
  }
  if (!runtimeOk) {
    return { recommendation: "keep-running", rationale: `Minimum runtime not yet reached.` };
  }
  if (!srm.ok) {
    return { recommendation: "keep-running", rationale: `Sample ratio mismatch (p=${srm.pValue.toFixed(4)}) — assignment looks broken; not deciding.` };
  }
  if (significant && treatment.rate > control.rate) {
    return { recommendation: "promote", rationale: `Treatment lifts ${exp.goal} by ${(liftPct * 100).toFixed(1)}% (p=${pValue.toFixed(4)}).` };
  }
  if (significant && treatment.rate < control.rate) {
    return { recommendation: "rollback", rationale: `Treatment hurts ${exp.goal} by ${(Math.abs(liftPct) * 100).toFixed(1)}% (p=${pValue.toFixed(4)}).` };
  }
  return { recommendation: "keep-running", rationale: `No significant difference yet (p=${pValue.toFixed(4)}).` };
}
