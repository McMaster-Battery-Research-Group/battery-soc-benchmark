import { spawn, execFile, type ChildProcess } from "child_process";
import { mkdtemp, readFile, rm } from "fs/promises";
import os from "os";
import path from "path";
import { EvaluationError, EvaluationCancelled, type DryRunOutput, type EvaluationInput, type EvaluationOutput, type Evaluator } from "./types";

/** Kill the evaluator AND everything it spawned (the MATLAB session for .m/.p packages). */
function killTree(child: ChildProcess) {
  if (!child.pid) return;
  if (process.platform === "win32") {
    execFile("taskkill", ["/PID", String(child.pid), "/T", "/F"], { windowsHide: true }, () => {});
  } else {
    try {
      process.kill(-child.pid, "SIGKILL"); // process group (spawned with detached: true)
    } catch {
      child.kill("SIGKILL");
    }
  }
}
import { parseResultsJson } from "./results";

/**
 * Runs evaluator/python/socbench_eval — the benchmark implementation (verified
 * identical to the lab's original MATLAB tool). Model.py runs in-process;
 * Model.m/.p is executed by MATLAB through matlab/Run_Model.m.
 *
 * Environment (evaluation host):
 *   SOCBENCH_PYTHON      python with numpy and scipy (default "python")
 *   SOCBENCH_BLIND_DATA  blind_data.mat produced by matlab/Export_Blind_Data.m
 *   MATLAB_BIN           matlab executable, only for Model.m/.p packages
 *   SOCBENCH_CAL_PYTHON / SOCBENCH_CAL_MATLAB  complexity calibration (s per sample)
 *   PY_EVAL_TIMEOUT_MIN  hard kill after this many minutes (default 180; dry runs 10)
 */
export class PythonEvaluator implements Evaluator {
  readonly name = "real";

  async evaluate(input: EvaluationInput): Promise<EvaluationOutput> {
    return parseResultsJson(await this.spawn(input, false), input.log);
  }

  async dryRun(input: EvaluationInput): Promise<DryRunOutput> {
    return JSON.parse(await this.spawn(input, true)) as DryRunOutput;
  }

  /** Runs socbench_eval and returns the results.json text. */
  private async spawn(input: EvaluationInput, dry: boolean): Promise<string> {
    const py = process.env.SOCBENCH_PYTHON ?? "python";
    const data = process.env.SOCBENCH_BLIND_DATA;
    if (!data && !dry) throw new EvaluationError("SOCBENCH_BLIND_DATA is not set on the evaluation host.", false);
    const pkgDir = path.resolve(process.cwd(), "evaluator", "python");
    const outDir = await mkdtemp(path.join(os.tmpdir(), "socbench-pyeval-"));
    const timeoutMs = Number(dry ? (process.env.DRY_RUN_TIMEOUT_MIN ?? 10) : (process.env.PY_EVAL_TIMEOUT_MIN ?? 180)) * 60_000;
    const args = ["-m", "socbench_eval", input.filePath, outDir, ...(data ? ["--data", data] : []), ...(dry ? ["--dry-run"] : [])];
    await input.log(`[eval] ${py} ${args.join(" ")}`);
    try {
      await new Promise<void>((resolve, reject) => {
        const child = spawn(py, args, {
          cwd: pkgDir,
          env: { ...process.env, PYTHONPATH: pkgDir, PYTHONUNBUFFERED: "1", PYTHONIOENCODING: "utf-8" },
          windowsHide: true,
          detached: process.platform !== "win32", // own process group on POSIX so killTree can take MATLAB with it
        });
        const timer = setTimeout(() => {
          killTree(child);
          reject(new EvaluationError(`Evaluation exceeded the ${timeoutMs / 60_000} minute limit.`, true));
        }, timeoutMs);
        const onAbort = () => {
          clearTimeout(timer);
          killTree(child);
          reject(new EvaluationCancelled());
        };
        if (input.signal?.aborted) return onAbort();
        input.signal?.addEventListener("abort", onAbort, { once: true });
        child.on("close", () => input.signal?.removeEventListener("abort", onAbort));
        let tail = "";
        const onData = (buf: Buffer) => {
          const text = buf.toString();
          tail = (tail + text).slice(-4000);
          for (const line of text.split(/\r?\n/).filter(Boolean)) void input.log(`[eval] ${line}`);
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
            reject(new EvaluationError(`Evaluator exited with code ${code}. ${tail.slice(-500)}`, false));
          }
        });
      });
      return await readFile(path.join(outDir, "results.json"), "utf8");
    } finally {
      await rm(outDir, { recursive: true, force: true }).catch(() => {});
    }
  }
}
