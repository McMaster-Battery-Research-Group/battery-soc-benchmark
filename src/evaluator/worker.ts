/**
 * Resident evaluation worker: polls the EvaluationJob / DryRun tables and runs
 * whatever is queued.
 *
 *   npm run worker
 *
 * Many machines can run one of these at once — jobs are claimed atomically, so
 * adding a computer just adds throughput. WORKER_CONCURRENCY (default 1) runs
 * that many evaluations in parallel on ONE machine (each is CPU-bound; keep it
 * ≤ physical cores / 2). Only outbound connections are used (Postgres, Blob,
 * SMTP), so a laptop behind NAT/VPN is fine.
 *
 * Every HEARTBEAT_MS the worker upserts a WorkerHeartbeat row with liveness,
 * machine diagnostics and its recent console output; the admin panel
 * (/admin/workers) reads those rows and can send pause / resume / stop
 * commands through the same row.
 */
import "dotenv/config";
import os from "os";
import { execFileSync } from "child_process";
import { statfsSync, accessSync, constants, readFileSync } from "fs";
import { db } from "@/lib/db";
import { claimNext, runNext, workerId, inflight, SHUTDOWN, WORKER_RUNTIMES, type WorkItem } from "./run-job";
import { getEvaluator } from "./index";
import { dockerUp, ensureDocker, sandboxMode } from "./python-evaluator";
import { installConsoleMirror, consoleTail } from "./console-ring";

const POLL_MS = 2000;
const HEARTBEAT_MS = 15_000;
const CONCURRENCY = Math.max(1, Number(process.env.WORKER_CONCURRENCY ?? 1) || 1);
// ---- ring-buffer console log (mirrored to the heartbeat row); job progress lines are pushed by run-job.ts
installConsoleMirror();

// ---- one-off diagnostics (cheap, cached; refreshed hourly)
type Diag = { pythonInfo: string; matlabInfo: string; blindData: boolean; gitSha: string; platform: string };
let diag: Diag | null = null;
let diagAt = 0;
function probe(cmd: string, args: string[]) {
  try {
    return execFileSync(cmd, args, { encoding: "utf8", timeout: 90_000, stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return "";
  }
}
function diagnostics(): Diag {
  if (diag && Date.now() - diagAt < 3600_000) return diag;
  const py = process.env.SOCBENCH_PYTHON ?? "python";
  const pyInfo = probe(py, [
    "-c",
    [
      "import sys, importlib, importlib.util",
      "def v(m):",
      "    if importlib.util.find_spec(m) is None: return None",
      "    return getattr(importlib.import_module(m), '__version__', '?')",
      "mods = [(m, v(m)) for m in ('numpy', 'scipy', 'torch')]",
      "print('Python %d.%d.%d' % sys.version_info[:3] + ''.join(' | %s %s' % (m, x) for m, x in mods if x))",
    ].join("\n"),
  ]);
  const mb = process.env.MATLAB_BIN;
  let matlabInfo = "not configured (Python packages only)";
  const mimg = process.env.EVAL_SANDBOX_MATLAB_IMAGE;
  if (mimg) {
    // MATLAB lives in the sandbox image: report its release and how it is licensed (never the token itself)
    const rel = probe("docker", ["run", "--rm", "--entrypoint", "ls", mimg, "/opt/matlab"]).split(/\s+/).find((x) => /^R20\d\d[ab]$/.test(x)) ?? "MATLAB";
    let lic = "no licence configured";
    if (process.env.EVAL_MATLAB_LICENSE) lic = `network licence ${process.env.EVAL_MATLAB_LICENSE}`;
    else if (process.env.EVAL_MATLAB_MHLM_FILE) {
      try {
        const j = JSON.parse(readFileSync(process.env.EVAL_MATLAB_MHLM_FILE, "utf8")) as { email?: string; expiry?: string; license_number?: string };
        const exp = j.expiry ? new Date(j.expiry) : null;
        const days = exp ? Math.round((exp.getTime() - Date.now()) / 86400_000) : null;
        lic = `online licensing as ${j.email ?? "?"}${j.license_number ? ` (licence ${j.license_number})` : ""}${days !== null ? `, identity token ${days < 0 ? "EXPIRED" : `expires in ${days} d`}` : ""}`;
      } catch {
        lic = `online licensing: cannot read ${process.env.EVAL_MATLAB_MHLM_FILE}`;
      }
    }
    matlabInfo = `${rel} in sandbox ${mimg} · ${lic}`;
  } else if (mb) {
    try {
      accessSync(mb, constants.X_OK);
      const m = /R20\d\d[ab]/.exec(mb);
      // Installed products matter: submissions routinely need Signal Processing / Deep Learning toolboxes.
      const ver = probe(mb, ["-batch", "v=ver; fprintf('%s;', v.Name)"]);
      const products = ver ? ver.split(";").map((s) => s.trim()).filter((s) => s && s !== "MATLAB") : [];
      matlabInfo = `${m?.[0] ?? "MATLAB"} at ${mb}` + (ver ? ` · toolboxes: ${products.length ? products.join(", ") : "none"}` : "");
    } catch {
      matlabInfo = `MATLAB_BIN not found: ${mb}`;
    }
  }
  let blindData = false;
  try {
    if (process.env.SOCBENCH_BLIND_DATA) {
      accessSync(process.env.SOCBENCH_BLIND_DATA, constants.R_OK);
      blindData = true;
    }
  } catch {}
  const gitSha = probe("git", ["rev-parse", "--short", "HEAD"]);
  diag = { pythonInfo: pyInfo || `${py} not found`, matlabInfo, blindData, gitSha, platform: `${os.type()} ${os.release()} ${os.arch()}` };
  diagAt = Date.now();
  return diag;
}
function diskFreeMb() {
  try {
    const s = statfsSync(process.cwd());
    return Math.round((Number(s.bavail) * Number(s.bsize)) / 1048576);
  } catch {
    return null;
  }
}

// ---- heartbeat
const stats = { completed: 0, failed: 0, lastError: null as string | null };
const busy = new Set<string>();
let paused = false;
let stopping = false;

async function heartbeat() {
  const d = diagnostics();
  const data = {
    hostname: os.hostname(),
    evaluator: getEvaluator().name,
    lastSeenAt: new Date(),
    busyWith: [...busy],
    concurrency: CONCURRENCY,
    runtimes: WORKER_RUNTIMES.join(","),
    paused,
    platform: d.platform,
    nodeVersion: process.version,
    cpus: os.cpus().length,
    loadAvg: Math.round((os.loadavg()[0] ?? 0) * 100) / 100,
    memTotalMb: Math.round(os.totalmem() / 1048576),
    memFreeMb: Math.round(os.freemem() / 1048576),
    diskFreeMb: diskFreeMb(),
    pythonInfo: d.pythonInfo,
    matlabInfo: d.matlabInfo,
    blindData: d.blindData,
    gitSha: d.gitSha,
    completed: stats.completed,
    failed: stats.failed,
    lastError: stats.lastError,
    log: consoleTail(),
  };
  try {
    const row = await db.workerHeartbeat.upsert({ where: { id: workerId() }, create: { id: workerId(), ...data }, update: data, select: { command: true } });
    if (row.command) {
      await db.workerHeartbeat.update({ where: { id: workerId() }, data: { command: null } });
      if (row.command === "pause") {
        paused = true;
        console.log("[worker] paused by administrator — finishing current work, not claiming new jobs");
      } else if (row.command === "resume") {
        paused = false;
        console.log("[worker] resumed by administrator");
      } else if (row.command === "stop") {
        stopping = true;
        console.log("[worker] stop requested by administrator — exiting after current work");
      }
      await db.workerHeartbeat.update({ where: { id: workerId() }, data: { paused } });
    }
  } catch (err) {
    console.error("[worker] heartbeat failed", err instanceof Error ? err.message : err);
  }
}

async function slot(item: WorkItem) {
  busy.add(item.id);
  void heartbeat();
  try {
    const r = await runNext(item);
    if (r.status === "FAILED") stats.failed++;
    else if (r.status === "COMPLETED" || r.status === "DRY_RUN") stats.completed++;
    // CANCELLED / RETRY are neither
  } catch (err) {
    stats.failed++;
    stats.lastError = err instanceof Error ? err.message : String(err);
    console.error("[worker] job error", err);
  } finally {
    busy.delete(item.id);
    void heartbeat();
  }
}

async function main() {
  console.log(`[worker] ${workerId()} online — evaluator "${getEvaluator().name}", concurrency ${CONCURRENCY}, polling every ${POLL_MS} ms`);
  {
    // Startup summary: everything an operator needs to see at a glance (no secrets).
    const d = diagnostics();
    const dbHost = (() => { try { return new URL(process.env.DATABASE_URL ?? "").hostname || "(unset)"; } catch { return "(unset)"; } })();
    console.log(`[worker] env: site ${process.env.NEXT_PUBLIC_SITE_URL ?? "(unset)"} · db ${dbHost} · storage ${process.env.STORAGE ?? "local"} · smtp ${process.env.SMTP_HOST ?? "(ethereal test inbox)"}`);
    console.log(`[worker] host: ${d.platform} · node ${process.version} · ${os.cpus().length} cpus · ${Math.round(os.totalmem() / 1073741824)} GB RAM · code ${d.gitSha || "?"}`);
    console.log(`[worker] python: ${d.pythonInfo}`);
    console.log(`[worker] matlab: ${d.matlabInfo}`);
    console.log(`[worker] blinded data: ${d.blindData ? `present (${process.env.SOCBENCH_BLIND_DATA})` : "MISSING — real evaluations will fail"}`);
    {
      if (sandboxMode() === "docker") {
        const up = dockerUp();
        console.log(`[worker] sandbox: docker — daemon ${up ? "running" : "NOT running (will try to start Docker Desktop)"} · image ${process.env.EVAL_SANDBOX_IMAGE ?? "socbench-eval"} · ${process.env.EVAL_CPUS ?? 2} cpu / ${process.env.EVAL_MEMORY ?? "4g"} · MATLAB image ${process.env.EVAL_SANDBOX_MATLAB_IMAGE || "none (MATLAB packages run on the host)"}`);
      } else {
        console.warn("[worker] sandbox: NONE — submissions run on this host with an allow-listed environment (EVAL_SANDBOX=none)");
      }
    }
  }
  await heartbeat();
  console.log("[worker] heartbeat registered — visible on /admin/workers");
  console.log(`[worker] runtimes claimed: ${WORKER_RUNTIMES.join(", ")}${WORKER_RUNTIMES.length < 2 ? " (other packages stay queued for another worker)" : ""}`);
  const hb = setInterval(() => void heartbeat(), HEARTBEAT_MS);
  const running = new Set<Promise<void>>();
  let exiting = false;
  /**
   * Graceful stop (Ctrl+C / SIGTERM / admin "stop"): kill in-flight evaluator
   * processes (and their MATLAB sessions), hand those jobs back to the queue,
   * remove our heartbeat row, then exit. A second Ctrl+C exits immediately.
   */
  const bye = async () => {
    if (exiting) process.exit(1);
    exiting = true;
    stopping = true;
    clearInterval(hb);
    if (inflight.size) {
      console.log(`[worker] stopping — aborting ${inflight.size} in-flight evaluation(s) and returning them to the queue`);
      for (const c of inflight) c.abort(SHUTDOWN);
      await Promise.race([Promise.allSettled([...running]), new Promise((r) => setTimeout(r, 15_000))]);
    }
    try {
      await db.workerHeartbeat.delete({ where: { id: workerId() } });
    } catch {}
    console.log("[worker] bye");
    process.exit(0);
  };
  process.on("SIGINT", () => void bye());
  process.on("SIGTERM", () => void bye());

  // Sandbox gate: with EVAL_SANDBOX=docker (the default) we never evaluate without the daemon.
  // If it is down, try to start Docker Desktop, otherwise hold the queue and say so.
  let sandboxOk = true;
  let lastDockerAttempt = 0;
  const needSandbox = sandboxMode() === "docker";
  if (needSandbox) {
    if (await ensureDocker(90_000, (l) => console.log(`[worker] ${l}`))) console.log("[worker] sandbox ready — Docker daemon reachable");
    else console.error("[worker] Docker is not available — evaluations are ON HOLD until it is (set EVAL_SANDBOX=none to run unsandboxed on a dedicated machine)");
  }
  console.log("[worker] waiting for work…");
  let lastIdleLog = Date.now();

  while (true) {
    if (stopping && running.size === 0 && !exiting) return bye(); // admin "stop" after current work drained
    try {
      if (needSandbox) {
        const up = dockerUp();
        if (!up && Date.now() - lastDockerAttempt > 5 * 60_000) {
          lastDockerAttempt = Date.now();
          await ensureDocker(60_000, (l) => console.log(`[worker] ${l}`));
        }
        const nowOk = up || dockerUp();
        if (nowOk !== sandboxOk) {
          sandboxOk = nowOk;
          stats.lastError = nowOk ? null : "Docker daemon not running — sandbox required, queue on hold";
          console.log(nowOk ? "[worker] sandbox available — resuming" : "[worker] sandbox unavailable — holding the queue");
          void heartbeat();
        }
      }
      if (!paused && !stopping && sandboxOk && running.size < CONCURRENCY) {
        const item = await claimNext();
        if (item) {
          console.log(`[worker] claimed ${item.kind === "dry" ? "dry run" : "submission"} ${item.id} (${running.size + 1}/${CONCURRENCY} slots busy)`);
          lastIdleLog = Date.now();
          const p = slot(item).finally(() => running.delete(p));
          running.add(p);
          continue; // try to fill the next slot immediately
        }
      }
    } catch (err) {
      console.error("[worker] loop error", err);
    }
    if (running.size === 0 && Date.now() - lastIdleLog > 10 * 60_000) {
      lastIdleLog = Date.now();
      console.log(`[worker] idle — no queued work (${stats.completed} completed, ${stats.failed} failed since start${sandboxOk ? "" : "; sandbox unavailable"})`);
    }
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
