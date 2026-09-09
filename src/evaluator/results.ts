import { EvaluationError, type EvaluationOutput } from "./types";
import { weightedError } from "@/lib/scoring";
import { METRIC_KEYS } from "@/lib/test-cases";
import { getActiveScoring } from "@/lib/scoring-config";

/** Shared parser for results.json emitted by both Evaluate_Submission.m and socbench_eval. */
export async function parseResultsJson(text: string, log: (line: string) => Promise<void> | void): Promise<EvaluationOutput> {
  const raw = JSON.parse(text) as Record<string, unknown>;
  const num = (k: string) => {
    const v = Number(raw[k]);
    if (!Number.isFinite(v)) throw new EvaluationError(`results.json missing numeric field "${k}"`, false);
    return v;
  };
  const metrics = Object.fromEntries(METRIC_KEYS.map((k) => [k, num(k)])) as Record<(typeof METRIC_KEYS)[number], number>;
  const scoring = await getActiveScoring();
  const site = weightedError(metrics, scoring.weights);
  const script = num("weightedError");
  let headline = script;
  if (!scoring.isDefault) {
    headline = site;
    await log(`custom scoring weights are active (set ${scoring.updatedAt?.toISOString() ?? "?"}): weighted error ${site} (evaluator's default-weight value ${script})`);
  } else if (Math.abs(site - script) > 0.01) await log(`NOTE weighted error differs: evaluator ${script} vs site ${site} — using evaluator value`);
  if (raw.suspicious) await log("NOTE evaluator flagged this submission as suspicious (mean RMSE > 25 %)");
  // Timing behind the complexity bin — needed to calibrate SOCBENCH_CAL_* per evaluation host (socbench-internal/docs/drac-migration.md)
  const sps = Number(raw.secondsPerSample);
  if (Number.isFinite(sps) && sps > 0) await log(`timing: ${(sps * 1e6).toFixed(3)} µs per sample (${String(raw.runtime ?? "?")} runtime) → complexity ${num("complexity")}`);
  return {
    ...metrics,
    weightedError: headline,
    complexity: Math.max(1, Math.min(10, Math.round(num("complexity")))),
    complexityUncertainty: 1,
    maxError: num("maxError"),
    robustness: (raw.robustness as EvaluationOutput["robustness"]) ?? undefined,
    perCycle: (raw.perCycle as EvaluationOutput["perCycle"]) ?? [],
    timeSeries: (raw.timeSeries as EvaluationOutput["timeSeries"]) ?? [],
    evaluatorVersion: String(raw.evaluatorVersion ?? "unknown"),
  };
}
