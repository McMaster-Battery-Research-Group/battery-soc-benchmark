import { MockEvaluator } from "./mock-evaluator";
import { PythonEvaluator } from "./python-evaluator";
import type { Evaluator } from "./types";

/**
 *   EVALUATOR=mock   deterministic fake numbers (dev/demo)
 *   EVALUATOR=real   socbench_eval — Python owns the benchmark; a Model.m/.p
 *                    package is executed by MATLAB through matlab/Run_Model.m
 */
export function getEvaluator(): Evaluator {
  const mode = (process.env.EVALUATOR ?? "mock").toLowerCase();
  return mode === "real" || mode === "auto" || mode === "python" || mode === "matlab" ? new PythonEvaluator() : new MockEvaluator();
}

export * from "./types";
