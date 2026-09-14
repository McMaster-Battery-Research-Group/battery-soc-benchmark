import { PythonEvaluator } from "./python-evaluator";
import type { Evaluator } from "./types";

/**
 * The one evaluator: socbench_eval — Python owns the benchmark; a Model.m/.p
 * package is executed by MATLAB through matlab/Run_Model.m. There is no mock:
 * every evaluation, including dry runs, is the real pipeline.
 */
let instance: Evaluator | undefined;
export function getEvaluator(): Evaluator {
  return (instance ??= new PythonEvaluator());
}
