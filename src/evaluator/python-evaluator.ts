import { spawn } from "child_process";
import { mkdtemp, readFile, rm } from "fs/promises";
import os from "os";
import path from "path";
import { EvaluationError, type EvaluationInput, type EvaluationOutput, type Evaluator } from "./types";
import { parseResultsJson } from "./results";

/**
 * Evaluates Model.py packages with evaluator/python/socbench_eval — a numpy/scipy
 * port of the lab's Standardized Evaluation Tool. No MATLAB required.
 *
 * Environment (evaluation host):
 *   SOCBENCH_PYTHON      python executable with numpy, scipy, openpyxl (default "python")
 *   SOCBENCH_BLIND_DATA  blind_data.mat produced by matlab/Export_Blind_Data.m
 *   PY_EVAL_TIMEOUT_MIN  hard kill after this many minutes (default 180)
 */
export class PythonEvaluator implements Evaluator {
  readonly name = "python";

  async evaluate(input: EvaluationInput): Promise<EvaluationOutput> {
    const py = process.env.SOCBENCH_PYTHON ?? "python";
    const data = process.env.SOCBENCH_BLIND_DATA;
    if (!data) throw new EvaluationError("SOCBENCH_BLIND_DATA is not set on the evaluation host.", false);
    const pkgDir = path.resolve(process.cwd(), "evaluator", "python");
    const outDir = await mkdtemp(path.join(os.tmpdir(), "socbench-pyeval-"));
    const timeoutMs = Number(process.env.PY_EVAL_TIMEOUT_MIN ?? 180) * 60_000;
    await input.log(`[python] ${py} -m socbench_eval "${input.filePath}" "${outDir}"`);
    try {
      await new Promise<void>((resolve, reject) => {
        const child = spawn(py, ["-m", "socbench_eval", input.filePath, outDir, "--data", data], {
          cwd: pkgDir,
          env: { ...process.env, PYTHONPATH: pkgDir, PYTHONUNBUFFERED: "1", PYTHONIOENCODING: "utf-8" },
          windowsHide: true,
        });
        const timer = setTimeout(() => {
          child.kill("SIGKILL");
          reject(new EvaluationError(`Evaluation exceeded the ${timeoutMs / 60_000} minute limit.`, true));
        }, timeoutMs);
        let tail = "";
        const onData = (buf: Buffer) => {
          const text = buf.toString();
          tail = (tail + text).slice(-4000);
          for (const line of text.split(/\r?\n/).filter(Boolean)) void input.log(`[python] ${line}`);
        };
        child.stdout.on("data", onData);
        child.stderr.on("data", onData);
        child.on("error", (e) => {
          clearTimeout(timer);
          reject(new EvaluationError(`Could not start Python (${e.message}). Check SOCBENCH_PYTHON.`, false));
        });
        child.on("close", async (code) => {
          clearTimeout(timer);
          if (code === 0) return resolve();
          try {
            const err = JSON.parse(await readFile(path.join(outDir, "error.json"), "utf8")) as { code: string; message: string };
            reject(new EvaluationError(`${err.code}: ${err.message}`, ["FORMAT", "VALIDATION", "RUNTIME"].includes(err.code)));
          } catch {
            reject(new EvaluationError(`Python evaluator exited with code ${code}. ${tail.slice(-500)}`, false));
          }
        });
      });
      return parseResultsJson(await readFile(path.join(outDir, "results.json"), "utf8"), input.log);
    } finally {
      await rm(outDir, { recursive: true, force: true }).catch(() => {});
    }
  }
}
