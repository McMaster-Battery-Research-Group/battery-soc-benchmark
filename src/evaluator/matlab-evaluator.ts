import { EvaluationError, type EvaluationInput, type EvaluationOutput, type Evaluator } from "./types";

/**
 * Adapter for the lab's MATLAB blind-modelling script.
 *
 * TODO once the original repository / script is available:
 *  1. Copy the uploaded model into the MATLAB working directory expected by the script.
 *  2. Spawn MATLAB (or the compiled MATLAB Runtime executable), e.g.
 *       matlab -batch "run_blind_eval('<path>')"
 *     streaming stdout into input.log().
 *  3. Parse the produced results table (RMSE / MAE / max per blinded drive cycle,
 *     132 rows) plus the test-case summary and time-domain arrays.
 *  4. Map into EvaluationOutput. `weightedError` should be computed with
 *     lib/scoring.ts so the website and the script agree on the headline metric.
 */
export class MatlabEvaluator implements Evaluator {
  readonly name = "matlab";

  async evaluate(input: EvaluationInput): Promise<EvaluationOutput> {
    await input.log("[matlab] evaluator not configured on this server");
    throw new EvaluationError(
      "The MATLAB evaluator is not configured on this server yet. Set EVALUATOR=mock for local development.",
      false,
    );
  }
}
