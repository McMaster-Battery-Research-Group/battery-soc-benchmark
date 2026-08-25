import { MatlabEvaluator } from "./matlab-evaluator";
import { MockEvaluator } from "./mock-evaluator";
import type { Evaluator } from "./types";

export function getEvaluator(): Evaluator {
  switch ((process.env.EVALUATOR ?? "mock").toLowerCase()) {
    case "matlab":
      return new MatlabEvaluator();
    default:
      return new MockEvaluator();
  }
}

export * from "./types";
