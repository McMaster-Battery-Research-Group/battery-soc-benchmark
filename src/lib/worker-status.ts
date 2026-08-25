import { db } from "@/lib/db";

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
    db.workerHeartbeat.findMany({ where: { lastSeenAt: { gte: since } }, select: { id: true, evaluator: true, busyWith: true, concurrency: true, paused: true } }),
    db.workerHeartbeat.findFirst({ orderBy: { lastSeenAt: "desc" }, select: { lastSeenAt: true } }),
    db.submission.count({ where: { status: "QUEUED" } }),
    db.submission.count({ where: { status: "RUNNING" } }),
  ]);
  const active = live.filter((w) => !w.paused);
  return { online: active.length > 0, lastSeenAt: latest?.lastSeenAt ?? null, workers: live, capacity: active.reduce((n, w) => n + w.concurrency, 0), queued, running };
}

/** 1-based position of a queued submission among all queued submissions (FIFO by job creation). */
export async function queuePosition(submissionId: string): Promise<number | null> {
  const job = await db.evaluationJob.findUnique({ where: { submissionId }, select: { createdAt: true } });
  if (!job) return null;
  const ahead = await db.evaluationJob.count({ where: { createdAt: { lt: job.createdAt }, submission: { status: "QUEUED" } } });
  return ahead + 1;
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
