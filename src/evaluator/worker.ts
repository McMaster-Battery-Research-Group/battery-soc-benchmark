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
import { statfsSync, accessSync, constants } from "fs";
import { db } from "@/lib/db";
import { claimNext, runNext, workerId, inflight, SHUTDOWN, type WorkItem } from "./run-job";
import { getEvaluator } from "./index";

const POLL_MS = 2000;
const HEARTBEAT_MS = 15_000;
const CONCURRENCY = Math.max(1, Number(process.env.WORKER_CONCURRENCY ?? 1) || 1);
const LOG_LINES = 200;

// ---- ring-buffer console log (mirrored to the heartbeat row)
const ring: string[] = [];
const push = (line: string) => {
  ring.push(`${new Date().toISOString()} ${line}`);
  if (ring.length > LOG_LINES) ring.splice(0, ring.length - LOG_LINES);
};
for (const k of ["log", "error", "warn"] as const) {
  const orig = console[k].bind(console);
  console[k] = (...a: unknown[]) => {
    orig(...a);
    push(a.map((x) => (x instanceof Error ? x.stack ?? x.message : typeof x === "string" ? x : JSON.stringify(x))).join(" "));
  };
}

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
  if (mb) {
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
    log: ring.join("\n"),
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
  await heartbeat();
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

  while (true) {
    if (stopping && running.size === 0 && !exiting) return bye(); // admin "stop" after current work drained
    try {
      if (!paused && !stopping && running.size < CONCURRENCY) {
        const item = await claimNext();
        if (item) {
          const p = slot(item).finally(() => running.delete(p));
          running.add(p);
          continue; // try to fill the next slot immediately
        }
      }
    } catch (err) {
      console.error("[worker] loop error", err);
    }
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
