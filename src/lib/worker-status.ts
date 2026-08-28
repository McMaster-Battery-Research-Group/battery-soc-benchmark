import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { progressFromLog } from "@/lib/progress";

/** A worker is "online" if it has heartbeaten within this window (heartbeat every 15 s). */
export const ONLINE_WINDOW_MS = 60_000;

export type EvaluatorStatus = {
  online: boolean;
  /** most recent heartbeat across all workers, null if none ever */
  lastSeenAt: Date | null;
  workers: { id: string; evaluator: string; busyWith: string[]; concurrency: number; paused: boolean; runtimes: string }[];
  /** total parallel slots across online, un-paused workers (that can run `runtime`, when given) */
  capacity: number;
  queued: number;
  running: number;
  /** the runtime this status was computed for (null = any) */
  runtime: string | null;
};

const canRun = (w: { runtimes: string }, runtime: string | null | undefined) => !runtime || w.runtimes.split(",").map((s) => s.trim()).includes(runtime);

/**
 * Evaluator availability, optionally for one package runtime ("python" | "matlab"): a worker only
 * counts if it declares that runtime (WORKER_RUNTIMES), so a MATLAB submission is reported as
 * "no evaluator available" while only the Python-only VM is online.
 */
export async function getEvaluatorStatus(runtime?: string | null): Promise<EvaluatorStatus> {
  const since = new Date(Date.now() - ONLINE_WINDOW_MS);
  const [all, queued, running] = await Promise.all([
    db.workerHeartbeat.findMany({ orderBy: { lastSeenAt: "desc" }, select: { id: true, evaluator: true, busyWith: true, concurrency: true, paused: true, lastError: true, runtimes: true, lastSeenAt: true } }),
    db.submission.count({ where: { status: "QUEUED", ...(runtime ? { OR: [{ runtime }, { runtime: null }] } : {}) } }),
    db.submission.count({ where: { status: "RUNNING", ...(runtime ? { OR: [{ runtime }, { runtime: null }] } : {}) } }),
  ]);
  const capable = all.filter((w) => canRun(w, runtime));
  const live = capable.filter((w) => w.lastSeenAt >= since);
  // paused workers and workers holding for the Docker sandbox contribute no capacity
  const active = live.filter((w) => !w.paused && !/sandbox required/.test(w.lastError ?? ""));
  return { online: active.length > 0, lastSeenAt: capable[0]?.lastSeenAt ?? null, workers: live, capacity: active.reduce((n, w) => n + w.concurrency, 0), queued, running, runtime: runtime ?? null };
}

/** 1-based position of a queued submission among all queued submissions (FIFO by job creation). */
export async function queuePosition(submissionId: string): Promise<number | null> {
  const job = await db.evaluationJob.findUnique({ where: { submissionId }, select: { createdAt: true, submission: { select: { runtime: true } } } });
  if (!job) return null;
  // only jobs the same kind of worker will process count as "ahead"
  const rt = job.submission.runtime;
  const ahead = await db.evaluationJob.count({ where: { createdAt: { lt: job.createdAt }, submission: { status: "QUEUED", ...(rt ? { OR: [{ runtime: rt }, { runtime: null }] } : {}) } } });
  return ahead + 1;
}

const FALLBACK_RUN_SEC = 45 * 60;

/**
 * Typical full-run duration for a model type, from the last completed runs
 * (job start line → completedAt). Falls back to all types, then to 45 min.
 */
export async function averageRunSec(modelType?: string): Promise<number> {
  const pick = async (where: Prisma.SubmissionWhereInput) =>
    db.submission.findMany({ where: { status: "COMPLETED", completedAt: { not: null }, job: { isNot: null }, ...where }, orderBy: { completedAt: "desc" }, take: 10, select: { completedAt: true, job: { select: { log: true } } } });
  const durations = (rows: Awaited<ReturnType<typeof pick>>) =>
    rows
      .map((r) => {
        const start = r.job?.log.split("\n").find((l) => /started evaluation/.test(l));
        const t0 = start ? Date.parse(start.split(" ")[0]) : NaN;
        return Number.isFinite(t0) && r.completedAt ? (r.completedAt.getTime() - t0) / 1000 : null;
      })
      .filter((d): d is number => d !== null && d > 60 && d < 6 * 3600);
  let d = modelType ? durations(await pick({ modelType: modelType as Prisma.EnumModelTypeFilter })) : [];
  if (d.length < 3) d = durations(await pick({}));
  if (!d.length) return FALLBACK_RUN_SEC;
  return d.reduce((a, b) => a + b, 0) / d.length;
}

/**
 * Seconds until a queued submission is expected to START: the live remaining
 * time of the evaluations occupying the slots, plus the typical duration of
 * every queued job ahead of it, spread over the available slots.
 */
export async function estimateQueueWaitSec(submissionId: string): Promise<{ position: number; capacity: number; running: number; waitSec: number | null }> {
  const me = await db.submission.findUnique({ where: { id: submissionId }, select: { runtime: true } });
  const [status, pos] = await Promise.all([getEvaluatorStatus(me?.runtime), queuePosition(submissionId)]);
  const position = pos ?? 1;
  const capacity = Math.max(1, status.capacity);
  if (!status.online) return { position, capacity, running: status.running, waitSec: null };

  // remaining time of each running evaluation (live), else its type's average
  const rtWhere = me?.runtime ? { OR: [{ runtime: me.runtime }, { runtime: null }] } : {};
  const runningJobs = await db.submission.findMany({ where: { status: "RUNNING", ...rtWhere }, select: { modelType: true, job: { select: { log: true } } } });
  const remaining: number[] = [];
  for (const r of runningJobs) {
    const p = progressFromLog(r.job?.log ?? "");
    remaining.push(p.etaSec ?? Math.max(0, (await averageRunSec(r.modelType)) - (p.elapsedSec ?? 0)));
  }
  // queued jobs ahead of us, each with its type's average
  const ahead = await db.submission.findMany({ where: { status: "QUEUED", ...rtWhere }, orderBy: { job: { createdAt: "asc" } }, take: Math.max(0, position - 1), select: { modelType: true } });
  const aheadSec: number[] = [];
  for (const a of ahead) aheadSec.push(await averageRunSec(a.modelType));

  // simple list-scheduling simulation over `capacity` slots
  const slots = Array.from({ length: capacity }, () => 0);
  remaining.sort((a, b) => a - b).forEach((r, i) => (slots[i % capacity] = Math.max(slots[i % capacity], r)));
  for (const s of aheadSec) {
    const i = slots.indexOf(Math.min(...slots));
    slots[i] += s;
  }
  return { position, capacity, running: status.running, waitSec: Math.round(Math.min(...slots)) };
}

export function ago(d: Date | null) {
  if (!d) return "never";
  const s = Math.max(0, Math.round((Date.now() - d.getTime()) / 1000));
  if (s < 90) return `${s} s ago`;
  const m = Math.round(s / 60);
  if (m < 90) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 36) return `${h} h ago`;
  return `${Math.round(h / 24)} d ago`;
}
