import { spawn } from "child_process";
import { mkdtemp, readFile, rm } from "fs/promises";
import os from "os";
import path from "path";
import { EvaluationError, type EvaluationInput, type EvaluationOutput, type Evaluator } from "./types";
import { parseResultsJson } from "./results";

/**
 * Runs the lab's Standardized Evaluation Tool through matlab/Evaluate_Submission.m.
 *
 * Environment (worker host only — the machine that has MATLAB + the blinded data):
 *   MATLAB_BIN          path to matlab executable (default: "matlab" on PATH)
 *   SOCBENCH_TOOL_DIR   folder containing Data_m*.mat and the lab's .m files
 *   SOCBENCH_PYTHON     python.exe with numpy+scipy, for Model.py submissions
 *   MATLAB_TIMEOUT_MIN  hard kill after this many minutes (default 180)
 */
export class MatlabEvaluator implements Evaluator {
  readonly name = "matlab";

  async evaluate(input: EvaluationInput): Promise<EvaluationOutput> {
    const toolDir = process.env.SOCBENCH_TOOL_DIR;
    if (!toolDir) throw new EvaluationError("SOCBENCH_TOOL_DIR is not set on the evaluation host.", false);
    const matlab = process.env.MATLAB_BIN ?? "matlab";
    const scriptDir = path.resolve(process.cwd(), "matlab");
    const outDir = await mkdtemp(path.join(os.tmpdir(), "socbench-eval-"));
    const timeoutMs = Number(process.env.MATLAB_TIMEOUT_MIN ?? 180) * 60_000;

    const q = (s: string) => s.replace(/\\/g, "/").replace(/'/g, "''");
    const cmd = `addpath('${q(scriptDir)}'); Evaluate_Submission('${q(input.filePath)}','${q(outDir)}','${q(toolDir)}')`;
    await input.log(`[matlab] ${matlab} -batch "${cmd}"`);

    try {
      await new Promise<void>((resolve, reject) => {
        const child = spawn(matlab, ["-batch", cmd], { env: { ...process.env }, windowsHide: true });
        const timer = setTimeout(() => {
          child.kill("SIGKILL");
          reject(new EvaluationError(`Evaluation exceeded the ${timeoutMs / 60_000} minute limit.`, true));
        }, timeoutMs);
        let tail = "";
        const onData = (buf: Buffer) => {
          const text = buf.toString();
          tail = (tail + text).slice(-4000);
          for (const line of text.split(/\r?\n/).filter(Boolean)) void input.log(`[matlab] ${line}`);
        };
        child.stdout.on("data", onData);
        child.stderr.on("data", onData);
        child.on("error", (e) => {
          clearTimeout(timer);
          reject(new EvaluationError(`Could not start MATLAB (${e.message}). Check MATLAB_BIN.`, false));
        });
        child.on("close", async (code) => {
          clearTimeout(timer);
          if (code === 0) return resolve();
          try {
            const err = JSON.parse(await readFile(path.join(outDir, "error.json"), "utf8")) as { code: string; message: string };
            const userFacing = ["FORMAT", "VALIDATION", "RUNTIME"].includes(err.code);
            reject(new EvaluationError(`${err.code}: ${err.message}`, userFacing));
          } catch {
            reject(new EvaluationError(`MATLAB exited with code ${code}. ${tail.slice(-500)}`, false));
          }
        });
      });

      return parseResultsJson(await readFile(path.join(outDir, "results.json"), "utf8"), input.log);
    } finally {
      await rm(outDir, { recursive: true, force: true }).catch(() => {});
    }
  }
}
