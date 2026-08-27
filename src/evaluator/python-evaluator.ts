import { spawn, execFile, execFileSync, type ChildProcess } from "child_process";
import { mkdtemp, readFile, rm, chmod } from "fs/promises";
import os from "os";
import path from "path";
import { EvaluationError, EvaluationCancelled, type DryRunOutput, type EvaluationInput, type EvaluationOutput, type Evaluator } from "./types";
import { parseResultsJson } from "./results";

/**
 * Runs evaluator/python/socbench_eval — the benchmark implementation (verified
 * identical to the lab's original MATLAB tool). Model.py runs in-process;
 * Model.m/.p is executed by MATLAB through matlab/Run_Model.m.
 *
 * SUBMISSIONS ARE UNTRUSTED CODE. Two isolation levels:
 *
 *   EVAL_SANDBOX=docker (recommended, default when `docker` is available)
 *     One container per evaluation: no network, read-only root FS, all
 *     capabilities dropped, no-new-privileges, pid/memory/CPU limits, and only
 *     three mounts — package (ro), blinded data (ro), output dir (rw). The
 *     container never sees the host environment, so no DB/SMTP/storage secrets.
 *       EVAL_SANDBOX_IMAGE          image for Model.py     (default socbench-eval)
 *       EVAL_SANDBOX_MATLAB_IMAGE   image for Model.m/.p   (unset → MATLAB packages run on the host, see below)
 *       EVAL_MATLAB_LICENSE         MLM_LICENSE_FILE for the MATLAB image, e.g. 27000@license.host
 *       EVAL_MATLAB_NETWORK         "bridge" only if the license server must be reachable (default none)
 *       EVAL_MEMORY / EVAL_CPUS / EVAL_PIDS   limits (default 4g / 2 / 256)
 *
 *   EVAL_SANDBOX=none
 *     Runs on the host with an ALLOW-LISTED environment (never the worker's
 *     secrets). Still lets a malicious model read the blinded data and touch
 *     the filesystem — use only on a dedicated, low-privilege account.
 *
 * Environment (evaluation host):
 *   SOCBENCH_PYTHON      python with numpy and scipy (default "python")
 *   SOCBENCH_BLIND_DATA  blind_data.mat produced by matlab/Export_Blind_Data.m
 *   MATLAB_BIN           matlab executable, only for Model.m/.p packages run on the host
 *   SOCBENCH_CAL_PYTHON / SOCBENCH_CAL_MATLAB  complexity calibration (s per sample)
 *   PY_EVAL_TIMEOUT_MIN  hard kill after this many minutes (default 180; dry runs 10)
 */

/** Only these host variables reach an evaluation process (host mode). Secrets never do. */
const HOST_ENV_ALLOW = [/^SOCBENCH_/, /^MATLAB_/, /^PATH$/i, /^PATHEXT$/i, /^SYSTEMROOT$/i, /^WINDIR$/i, /^COMSPEC$/i, /^TEMP$/i, /^TMP$/i, /^TMPDIR$/i, /^HOME$/i, /^USERPROFILE$/i, /^LOCALAPPDATA$/i, /^APPDATA$/i, /^PROGRAMDATA$/i, /^LANG$/, /^LC_/, /^PYTHON/, /^VIRTUAL_ENV$/, /^CONDA_/, /^MLM_LICENSE_FILE$/, /^LM_LICENSE_FILE$/];
function allowListedEnv(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) if (v !== undefined && HOST_ENV_ALLOW.some((re) => re.test(k))) out[k] = v;
  return out;
}

/** Is the Docker daemon reachable right now? (not cached — Docker Desktop comes and goes) */
export function dockerUp(): boolean {
  try {
    execFileSync("docker", ["version", "--format", "{{.Server.Os}}"], { stdio: ["ignore", "pipe", "ignore"], timeout: 15_000, windowsHide: true });
    return true;
  } catch {
    return false;
  }
}

/** Configured sandbox mode: "docker" unless EVAL_SANDBOX=none is set explicitly. */
export function sandboxMode(): "docker" | "none" {
  return (process.env.EVAL_SANDBOX ?? "docker").toLowerCase() === "none" ? "none" : "docker";
}

/**
 * Try to bring the Docker daemon up (Docker Desktop on Windows/macOS). Returns
 * when it answers or after `waitMs`. Safe to call repeatedly.
 */
export async function ensureDocker(waitMs = 90_000, log?: (l: string) => void): Promise<boolean> {
  if (dockerUp()) return true;
  const candidates =
    process.platform === "win32"
      ? [path.join(process.env["ProgramFiles"] ?? "C:\\Program Files", "Docker", "Docker", "Docker Desktop.exe")]
      : process.platform === "darwin"
        ? ["/Applications/Docker.app"]
        : [];
  for (const c of candidates) {
    try {
      log?.(`[sandbox] Docker daemon not running — starting ${c}`);
      if (process.platform === "darwin") execFile("open", ["-a", c]);
      else spawn(c, [], { detached: true, stdio: "ignore", windowsHide: true }).unref();
      break;
    } catch (e) {
      log?.(`[sandbox] could not start Docker Desktop: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  const deadline = Date.now() + waitMs;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 5_000));
    if (dockerUp()) {
      log?.("[sandbox] Docker daemon is up");
      return true;
    }
  }
  return false;
}

/** Kill the evaluator AND everything it spawned (the MATLAB session for .m/.p packages). */
function killTree(child: ChildProcess, container?: string) {
  if (container) execFile("docker", ["kill", container], { windowsHide: true }, () => {});
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

const toDockerPath = (p: string) => path.resolve(p).replace(/\\/g, "/");

function packageRuntime(filePath: string): "python" | "matlab" | "unknown" {
  try {
    // Cheap peek at the central directory: adm-zip is already a dependency of the web tier.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const AdmZip = require("adm-zip") as typeof import("adm-zip");
    const names = new AdmZip(filePath).getEntries().map((e) => e.entryName);
    if (names.includes("Model.py")) return "python";
    if (names.includes("Model.m") || names.includes("Model.p")) return "matlab";
  } catch {}
  return "unknown";
}

export class PythonEvaluator implements Evaluator {
  readonly name = "real";

  async evaluate(input: EvaluationInput): Promise<EvaluationOutput> {
    return parseResultsJson(await this.spawn(input, false), input.log);
  }

  async dryRun(input: EvaluationInput): Promise<DryRunOutput> {
    return JSON.parse(await this.spawn(input, true)) as DryRunOutput;
  }

  /** Runs socbench_eval (in a container when possible) and returns the results.json text. */
  private async spawn(input: EvaluationInput, dry: boolean): Promise<string> {
    const data = process.env.SOCBENCH_BLIND_DATA;
    if (!data && !dry) throw new EvaluationError("SOCBENCH_BLIND_DATA is not set on the evaluation host.", false);
    const outDir = await mkdtemp(path.join(os.tmpdir(), "socbench-pyeval-"));
    const timeoutMs = Number(dry ? (process.env.DRY_RUN_TIMEOUT_MIN ?? 10) : (process.env.PY_EVAL_TIMEOUT_MIN ?? 180)) * 60_000;

    const mode = sandboxMode();
    const runtime = packageRuntime(input.filePath);
    const matlabImage = process.env.EVAL_SANDBOX_MATLAB_IMAGE;
    const useDocker = mode === "docker" && (runtime !== "matlab" || !!matlabImage);
    // Never fall back silently: if the sandbox is required but the daemon is down, fail this
    // attempt as an internal (retryable) error — the worker holds the queue until Docker is back.
    if (useDocker && !dockerUp()) throw new EvaluationError("Docker sandbox required (EVAL_SANDBOX=docker) but the Docker daemon is not running on the evaluation host.", false);

    let cmd: string;
    let args: string[];
    let env: Record<string, string>;
    let container: string | undefined;
    if (useDocker) {
      container = `socbench-${input.submissionId.slice(-8)}-${Date.now().toString(36)}`;
      await chmod(outDir, 0o777).catch(() => {}); // the container user (uid 1000) must be able to write results here
      const image = runtime === "matlab" ? matlabImage! : (process.env.EVAL_SANDBOX_IMAGE ?? "socbench-eval");
      const network = runtime === "matlab" && process.env.EVAL_MATLAB_NETWORK ? process.env.EVAL_MATLAB_NETWORK : "none";
      cmd = "docker";
      args = [
        "run", "--rm", "--name", container,
        "--network", network,
        "--read-only", "--tmpfs", "/work:rw,exec,size=2g", "--tmpfs", "/tmp:rw,size=512m",
        "--cap-drop", "ALL", "--security-opt", "no-new-privileges",
        "--pids-limit", process.env.EVAL_PIDS ?? "256", "--memory", process.env.EVAL_MEMORY ?? "4g", "--cpus", process.env.EVAL_CPUS ?? "2",
        "-v", `${toDockerPath(input.filePath)}:/in/package.zip:ro`,
        "-v", `${toDockerPath(outDir)}:/out:rw`,
        // the blinded data is mounted ONLY for real evaluations — dry runs use the open data baked into the image
        ...(data && !dry ? ["-v", `${toDockerPath(data)}:/data/blind_data.mat:ro`] : []),
        ...["SOCBENCH_CAL_PYTHON", "SOCBENCH_CAL_MATLAB", "SOCBENCH_TIMEOUT_MIN"].flatMap((k) => (process.env[k] ? ["-e", `${k}=${process.env[k]}`] : [])),
        ...(runtime === "matlab" && process.env.EVAL_MATLAB_LICENSE ? ["-e", `MLM_LICENSE_FILE=${process.env.EVAL_MATLAB_LICENSE}`] : []),
        image,
        "/in/package.zip", "/out", ...(data && !dry ? ["--data", "/data/blind_data.mat"] : []), ...(dry ? ["--dry-run"] : []),
      ];
      env = allowListedEnv(); // for the docker CLI itself
      await input.log(`[eval] sandbox: docker image ${image} (network ${network}, read-only, no capabilities, ${process.env.EVAL_CPUS ?? "2"} cpu / ${process.env.EVAL_MEMORY ?? "4g"})`);
    } else {
      cmd = process.env.SOCBENCH_PYTHON ?? "python";
      const pkgDir = path.resolve(process.cwd(), "evaluator", "python");
      args = ["-m", "socbench_eval", input.filePath, outDir, ...(data ? ["--data", data] : []), ...(dry ? ["--dry-run"] : [])];
      env = { ...allowListedEnv(), PYTHONPATH: pkgDir, PYTHONUNBUFFERED: "1", PYTHONIOENCODING: "utf-8" };
      await input.log(mode === "docker" ? `[eval] sandbox: MATLAB package but EVAL_SANDBOX_MATLAB_IMAGE is not set — running on the host with an allow-listed environment` : `[eval] sandbox: none — running on the host with an allow-listed environment`);
    }
    await input.log(`[eval] ${cmd} ${args.join(" ")}`);

    try {
      await new Promise<void>((resolve, reject) => {
        const child = spawn(cmd, args, {
          cwd: useDocker ? undefined : path.resolve(process.cwd(), "evaluator", "python"),
          env: env as NodeJS.ProcessEnv,
          windowsHide: true,
          detached: process.platform !== "win32", // own process group on POSIX so killTree can take MATLAB with it
        });
        const timer = setTimeout(() => {
          killTree(child, container);
          reject(new EvaluationError(`Evaluation exceeded the ${timeoutMs / 60_000} minute limit.`, true));
        }, timeoutMs);
        const onAbort = () => {
          clearTimeout(timer);
          killTree(child, container);
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
          reject(new EvaluationError(`Could not start ${useDocker ? "Docker" : "Python"} (${e.message}). Check ${useDocker ? "Docker Desktop / EVAL_SANDBOX" : "SOCBENCH_PYTHON"}.`, false));
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
