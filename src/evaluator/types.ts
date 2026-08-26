import type { MetricValues } from "@/lib/scoring";

export interface PerCycleRow {
  cell: string;
  cycle: string;
  temperatureC: number;
  rmse: number;
  mae: number;
  maxErr: number;
  durationH: number;
}

export interface TimeSeriesTrace {
  key: string;
  label: string;
  cell: string;
  cycle: string;
  temperatureC: number;
  /** hours */
  t: number[];
  /** % SOC */
  actual: number[];
  estimated: number[];
}

export interface EvaluationOutput extends MetricValues {
  weightedError: number;
  complexity: number;
  complexityUncertainty: number;
  maxError: number;
  perCycle: PerCycleRow[];
  timeSeries: TimeSeriesTrace[];
  evaluatorVersion: string;
}

export interface EvaluationInput {
  submissionId: string;
  /** Absolute path to the uploaded submission package (.zip with Model.m, Model.p or Model.py at the top level) */
  filePath: string;
  fileType: "ZIP" | "MAT" | "PY";
  modelType: string;
  evaluationLevel: "DYNAMIC" | "STATIC";
  /** Append a line to the job log (persisted, shown to the submitter on failure) */
  log: (line: string) => Promise<void> | void;
  /** Aborted when the owner cancels: implementations must kill the evaluator process (and its MATLAB child). */
  signal?: AbortSignal;
}

/** Thrown by evaluators when `signal` fires. */
export class EvaluationCancelled extends Error {
  constructor() {
    super("Evaluation cancelled by the submitter.");
    this.name = "EvaluationCancelled";
  }
}

/**
 * The seam between the web app and the lab's MATLAB blind-modelling script.
 * Implementations must be pure with respect to the database: return results,
 * do not write them. The worker persists the output.
 */
export interface DryRunOutput {
  runtime: string;
  cycle: { cell: string; cycle: string; temperatureC: number; samples: number };
  rmse: number;
  mae: number;
  maxErr: number;
  secondsPerSample: number;
  complexity: number;
  trace: { t: number[]; actual: number[]; estimated: number[] };
  elapsedSec: number;
}

export interface Evaluator {
  readonly name: string;
  evaluate(input: EvaluationInput): Promise<EvaluationOutput>;
  /** Pre-submission check on open data — validation + one public cycle. */
  dryRun(input: EvaluationInput): Promise<DryRunOutput>;
}

export class EvaluationError extends Error {
  constructor(message: string, public readonly userFacing = true) {
    super(message);
    this.name = "EvaluationError";
  }
}
