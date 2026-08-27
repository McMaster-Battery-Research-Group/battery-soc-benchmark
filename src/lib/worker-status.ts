import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { progressFromLog } from "@/lib/progress";

/** A worker is "online" if it has heartbeaten within this window (heartbeat every 15 s). */
export const ONLINE_WINDOW_MS = 60_000;

export type EvaluatorStatus = {
  online: boolean;
  /** most recent heartbeat across all workers, null if none ever */
  lastSeenAt: Date | null;
  workers: { id: string; evaluator: string; busyWith: string[]; concurrency: number; paused: boolean }[];
  /** total parallel slots across online, un-paused workers */
  capacity: number;
  queued: number;
  running: number;
};

export async function getEvaluatorStatus(): Promise<EvaluatorStatus> {
  const since = new Date(Date.now() - ONLINE_WINDOW_MS);
  const [live, latest, queued, running] = await Promise.all([
    db.workerHeartbeat.findMany({ where: { lastSeenAt: { gte: since } }, select: { id: true, evaluator: true, busyWith: true, concurrency: true, paused: true, lastError: true } }),
    db.workerHeartbeat.findFirst({ orderBy: { lastSeenAt: "desc" }, select: { lastSeenAt: true } }),
    db.submission.count({ where: { status: "QUEUED" } }),
    db.submission.count({ where: { status: "RUNNING" } }),
  ]);
  // paused workers and workers holding for the Docker sandbox contribute no capacity
  const active = live.filter((w) => !w.paused && !/sandbox required/.test(w.lastError ?? ""));
  return { online: active.length > 0, lastSeenAt: latest?.lastSeenAt ?? null, workers: live, capacity: active.reduce((n, w) => n + w.concurrency, 0), queued, running };
}

/** 1-based position of a queued submission among all queued submissions (FIFO by job creation). */
export async function queuePosition(submissionId: string): Promise<number | null> {
  const job = await db.evaluationJob.findUnique({ where: { submissionId }, select: { createdAt: true } });
  if (!job) return null;
  const ahead = await db.evaluationJob.count({ where: { createdAt: { lt: job.createdAt }, submission: { status: "QUEUED" } } });
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
  const [status, pos] = await Promise.all([getEvaluatorStatus(), queuePosition(submissionId)]);
  const position = pos ?? 1;
  const capacity = Math.max(1, status.capacity);
  if (!status.online) return { position, capacity, running: status.running, waitSec: null };

  // remaining time of each running evaluation (live), else its type's average
  const runningJobs = await db.submission.findMany({ where: { status: "RUNNING" }, select: { modelType: true, job: { select: { log: true } } } });
  const remaining: number[] = [];
  for (const r of runningJobs) {
    const p = progressFromLog(r.job?.log ?? "");
    remaining.push(p.etaSec ?? Math.max(0, (await averageRunSec(r.modelType)) - (p.elapsedSec ?? 0)));
  }
  // queued jobs ahead of us, each with its type's average
  const ahead = await db.submission.findMany({ where: { status: "QUEUED" }, orderBy: { job: { createdAt: "asc" } }, take: Math.max(0, position - 1), select: { modelType: true } });
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
