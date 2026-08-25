import AdmZip from "adm-zip";
import { readFile } from "fs/promises";
import { MatlabEvaluator } from "./matlab-evaluator";
import { MockEvaluator } from "./mock-evaluator";
import { PythonEvaluator } from "./python-evaluator";
import { EvaluationError, type EvaluationInput, type EvaluationOutput, type Evaluator } from "./types";

/**
 * Routes a package to the right runtime by its contents:
 *   Model.py         → PythonEvaluator (numpy/scipy port; no MATLAB needed)
 *   Model.m / .p     → MatlabEvaluator (lab's tool via Evaluate_Submission.m)
 */
export class AutoEvaluator implements Evaluator {
  readonly name = "auto";
  private py = new PythonEvaluator();
  private ml = new MatlabEvaluator();

  async evaluate(input: EvaluationInput): Promise<EvaluationOutput> {
    const names = new AdmZip(await readFile(input.filePath)).getEntries().map((e) => e.entryName);
    if (names.includes("Model.py")) {
      await input.log("[auto] Model.py detected → Python evaluator");
      return this.py.evaluate(input);
    }
    if (names.includes("Model.m") || names.includes("Model.p")) {
      await input.log(`[auto] ${names.includes("Model.m") ? "Model.m" : "Model.p"} detected → MATLAB evaluator`);
      return this.ml.evaluate(input);
    }
    throw new EvaluationError("No Model.py, Model.m or Model.p found in the package.", true);
  }
}

export function getEvaluator(): Evaluator {
  switch ((process.env.EVALUATOR ?? "mock").toLowerCase()) {
    case "auto":
      return new AutoEvaluator();
    case "matlab":
      return new MatlabEvaluator();
    case "python":
      return new PythonEvaluator();
    default:
      return new MockEvaluator();
  }
}

export * from "./types";
