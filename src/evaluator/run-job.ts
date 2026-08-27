/**
 * Claim-and-run one evaluation job. Shared by the long-running worker
 * (worker.ts) and the on-demand API route (/api/jobs/run) so the queue can be
 * drained either by a resident process or by an external cron ping.
 */
import { hostname } from "os";
import { db } from "@/lib/db";
import { storage } from "@/lib/storage";
import { evaluationCompleteEmail } from "@/lib/mail";
import { buildSubmissionReport, type ReportInput } from "@/lib/report";
import { getEvaluator } from "./index";
import { EvaluationError, EvaluationCancelled } from "./types";
import { recordRevision, getHistory } from "@/lib/history";
import { METRIC_KEYS, type MetricKey } from "@/lib/test-cases";

export const STALE_LOCK_MS = 30 * 60 * 1000;
export const MAX_ATTEMPTS = 2;

/** Abort controllers of evaluations currently running in this process (for graceful shutdown). */
export const inflight = new Set<AbortController>();
/** `abort(SHUTDOWN)` = release the job back to the queue (worker stopping), as opposed to a submitter cancel. */
export const SHUTDOWN = "shutdown";

/** Dry runs are short and interactive, so they jump the queue. */
export async function claimDryRun() {
  const staleBefore = new Date(Date.now() - 15 * 60 * 1000);
  const c = await db.dryRun.findFirst({
    where: { status: { in: ["QUEUED", "RUNNING"] }, OR: [{ lockedAt: null }, { lockedAt: { lt: staleBefore } }] },
    orderBy: { createdAt: "asc" },
  });
  if (!c) return null;
  const { count } = await db.dryRun.updateMany({ where: { id: c.id, lockedAt: c.lockedAt }, data: { lockedAt: new Date(), status: "RUNNING" } });
  return count === 1 ? c : null;
}

export async function runDryRun(id: string) {
  const evaluator = getEvaluator();
  const dr = await db.dryRun.findUnique({ where: { id } });
  if (!dr) return;
  const log = async (line: string) => {
    process.stdout.write(`[dry ${id.slice(-6)}] ${line}\n`); // visible in the worker terminal / admin console too
    const cur = await db.dryRun.findUnique({ where: { id }, select: { log: true } }).catch(() => null);
    if (cur) await db.dryRun.update({ where: { id }, data: { log: cur.log + `${new Date().toISOString()} ${line}\n` } }).catch(() => {});
  };
  try {
    await log(`${workerId()} started dry run of ${dr.fileName} (${Math.round(dr.fileSize / 1024)} KB)`);
    const localPath = await storage.materialize(dr.fileKey);
    const out = await evaluator.dryRun({ submissionId: dr.id, filePath: localPath, fileType: "ZIP", modelType: "OTHER", evaluationLevel: "DYNAMIC", log });
    await log(`dry run OK — ${out.runtime} runtime, RMSE ${out.rmse.toFixed(3)} % on the open cycle, ${out.elapsedSec} s`);
    await db.dryRun.update({ where: { id }, data: { status: "COMPLETED", result: out as object, completedAt: new Date(), lockedAt: null } });
  } catch (err) {
    const message = err instanceof EvaluationError && err.userFacing ? err.message : "The evaluator encountered an internal error.";
    await log(`FAILED: ${err instanceof Error ? err.message : String(err)}`);
    await db.dryRun.update({ where: { id }, data: { status: "FAILED", failureMessage: message, completedAt: new Date(), lockedAt: null } });
  } finally {
    await storage.remove(dr.fileKey);
  }
}

export type WorkItem = { kind: "dry"; id: string } | { kind: "job"; id: string };

/** Claim the next unit of work: dry runs first, then evaluation jobs. */
export async function claimNext(): Promise<WorkItem | null> {
  const d = await claimDryRun();
  if (d) return { kind: "dry", id: d.id };
  const j = await claimJob();
  return j ? { kind: "job", id: j.id } : null;
}

export async function runNext(item: WorkItem) {
  if (item.kind === "dry") {
    await runDryRun(item.id);
    return { submissionId: item.id, status: "DRY_RUN" as const };
  }
  return runJob(item.id);
}

export async function claimJob() {
  const staleBefore = new Date(Date.now() - STALE_LOCK_MS);
  const candidate = await db.evaluationJob.findFirst({
    where: {
      attempts: { lt: MAX_ATTEMPTS },
      OR: [{ lockedAt: null }, { lockedAt: { lt: staleBefore } }],
      submission: { status: { in: ["QUEUED", "RUNNING"] } },
    },
    orderBy: { createdAt: "asc" },
  });
  if (!candidate) return null;
  const { count } = await db.evaluationJob.updateMany({
    where: { id: candidate.id, lockedAt: candidate.lockedAt },
    data: { lockedAt: new Date(), lockedBy: workerId(), attempts: { increment: 1 } },
  });
  return count === 1 ? candidate : null;
}

export function workerId() {
  return `${hostname()}-${process.pid}`;
}

export async function runJob(jobId: string): Promise<{ submissionId: string; status: "COMPLETED" | "FAILED" | "RETRY" | "CANCELLED" }> {
  const evaluator = getEvaluator();
  const job = await db.evaluationJob.findUnique({ where: { id: jobId }, include: { submission: { include: { user: true, collaborators: { include: { user: { select: { email: true, name: true } } } } } } } });
  if (!job) throw new Error("job vanished");
  const sub = job.submission;
  /** Owner first, then every *confirmed* collaborator — pending (un-notified) ones get nothing until the owner confirms. */
  const recipients = async () => {
    // re-read: collaborators may have been added/confirmed while the evaluation ran
    const fresh = await db.submissionCollaborator.findMany({ where: { submissionId: sub.id }, include: { user: { select: { email: true, name: true } } } });
    const skipped = fresh.filter((c) => !c.notifiedAt);
    if (skipped.length) await log(`${skipped.length} pending collaborator(s) not e-mailed — the owner has not confirmed them yet`);
    return [{ email: sub.user.email, name: sub.user.name }, ...fresh.filter((c) => c.notifiedAt).map((c) => c.user)];
  };
  // Cancellation: the owner sets EvaluationJob.cancelRequestedAt; we notice it on
  // the next log line or the 10 s poll and abort the evaluator (which kills MATLAB too).
  const abort = new AbortController();
  inflight.add(abort);
  const log = async (line: string) => {
    const stamped = `${new Date().toISOString()} ${line}\n`;
    process.stdout.write(`[${sub.seq}] ${line}\n`);
    const cur = await db.evaluationJob.findUnique({ where: { id: jobId }, select: { log: true, cancelRequestedAt: true } }).catch(() => undefined);
    if (cur === null) {
      // job row gone: the submission was cancelled/deleted while we were evaluating it
      if (!abort.signal.aborted) abort.abort();
      return;
    }
    if (!cur) return; // transient DB error — keep going
    if (cur.cancelRequestedAt && !abort.signal.aborted) abort.abort();
    // Every log line also refreshes the lock (heartbeat): a real evaluation can
    // run for an hour, far longer than STALE_LOCK_MS, and must not be re-claimed
    // by another worker while it is still making progress.
    await db.evaluationJob.update({ where: { id: jobId }, data: { log: cur.log + stamped, lockedAt: new Date() } }).catch(() => {});
  };
  const cancelPoll = setInterval(async () => {
    const j = await db.evaluationJob.findUnique({ where: { id: jobId }, select: { cancelRequestedAt: true } }).catch(() => undefined);
    if ((j === null || j?.cancelRequestedAt) && !abort.signal.aborted) abort.abort();
  }, 10_000);

  await db.submission.update({ where: { id: sub.id }, data: { status: "RUNNING" } });
  await log(`${workerId()} started evaluation with "${evaluator.name}" evaluator (attempt ${job.attempts})`);

  try {
    const localPath = await storage.materialize(sub.fileKey);
    await log(`package ready at ${localPath}`);
    const out = await evaluator.evaluate({ submissionId: sub.id, filePath: localPath, fileType: sub.fileType, modelType: sub.modelType, evaluationLevel: sub.evaluationLevel, log, signal: abort.signal });
    clearInterval(cancelPoll);
    inflight.delete(abort);
    const { perCycle, timeSeries, evaluatorVersion, ...scalars } = out;
    await db.$transaction([
      db.evaluationResult.upsert({
        where: { submissionId: sub.id },
        create: { submissionId: sub.id, ...scalars, perCycle: perCycle as object, timeSeries: timeSeries as object, evaluatorVersion },
        update: { ...scalars, perCycle: perCycle as object, timeSeries: timeSeries as object, evaluatorVersion },
      }),
      db.submission.update({ where: { id: sub.id }, data: { status: "COMPLETED", completedAt: new Date(), failureMessage: null } }),
      db.evaluationJob.update({ where: { id: jobId }, data: { lockedAt: null, lockedBy: null } }),
    ]);
    await log(`completed — weighted error ${out.weightedError.toFixed(3)} %`);
    await recordRevision({ submissionId: sub.id, kind: sub.version > 1 || job.attempts > 1 ? "reevaluation" : "evaluation", evaluatorVersion, weightedError: out.weightedError, complexity: out.complexity, maxError: out.maxError, metrics: Object.fromEntries(METRIC_KEYS.map((k) => [k, (out as unknown as Record<MetricKey, number>)[k]])), note: `v${sub.version} · attempt ${job.attempts}`, by: workerId() });
    await storage.remove(sub.fileKey); // packages are deleted immediately after evaluation
    let report: Buffer | undefined;
    try {
      const fresh = await db.submission.findUnique({ where: { id: sub.id }, include: { result: true, collaborators: { where: { acceptedAt: { not: null } }, include: { user: { select: { name: true, affiliation: true } } }, orderBy: { addedAt: "asc" } } } });
      if (fresh?.result) report = await buildSubmissionReport({ submission: fresh, user: sub.user, collaborators: fresh.collaborators.map((c) => c.user), result: fresh.result as unknown as ReportInput["result"], history: await getHistory(sub.id), siteUrl: process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000" });
    } catch (e) {
      await log(`report generation failed (email sent without attachment): ${e instanceof Error ? e.message : String(e)}`);
    }
    for (const r of await recipients()) {
      const sent = await evaluationCompleteEmail(r.email, r.name, sub.modelName, sub.id, true, `All-cells RMSE: ${out.allCells.toFixed(2)} %, weighted error: ${out.weightedError.toFixed(2)} %.`, report);
      await log(sent ? `results email sent to ${r.email}${report ? " with PDF report" : ""}` : `results email to ${r.email} FAILED — check SMTP_* settings on the worker host`);
    }
    return { submissionId: sub.id, status: "COMPLETED" };
  } catch (err) {
    clearInterval(cancelPoll);
    inflight.delete(abort);
    if (abort.signal.aborted && abort.signal.reason === SHUTDOWN) {
      // Worker is stopping: hand the job back untouched so another (or the restarted) worker picks it up.
      await log(`worker ${workerId()} is shutting down — evaluation stopped and returned to the queue (no attempt used)`);
      await db.evaluationJob.update({ where: { id: jobId }, data: { lockedAt: null, lockedBy: null, attempts: { decrement: 1 } } }).catch(() => {});
      await db.submission.update({ where: { id: sub.id }, data: { status: "QUEUED" } }).catch(() => {});
      return { submissionId: sub.id, status: "RETRY" };
    }
    if (err instanceof EvaluationCancelled || abort.signal.aborted) {
      await storage.remove(sub.fileKey);
      const previous = sub.version > 1 ? await db.evaluationResult.findUnique({ where: { submissionId: sub.id }, select: { id: true } }).catch(() => null) : null;
      if (previous) {
        // a new version was cancelled mid-run: keep the previous version's score
        process.stdout.write(`[${sub.seq}] v${sub.version} cancelled by the submitter — evaluator stopped, previous score kept\n`);
        await db.submission.update({ where: { id: sub.id }, data: { status: "COMPLETED", version: sub.version - 1, completedAt: new Date() } }).catch(() => {});
        await db.evaluationJob.update({ where: { id: jobId }, data: { lockedAt: null, lockedBy: null, cancelRequestedAt: null } }).catch(() => {});
        await recordRevision({ submissionId: sub.id, kind: "cancelled", evaluatorVersion: "-", note: `v${sub.version} evaluation cancelled — v${sub.version - 1} score kept`, by: workerId() }).catch(() => {});
        return { submissionId: sub.id, status: "CANCELLED" };
      }
      process.stdout.write(`[${sub.seq}] cancelled by the submitter — evaluator stopped, submission removed\n`);
      await db.submission.delete({ where: { id: sub.id } }).catch(() => {}); // cascades to job + result + history
      return { submissionId: sub.id, status: "CANCELLED" };
    }
    const message = err instanceof EvaluationError && err.userFacing ? err.message : "The evaluator encountered an internal error. The administrators have been notified.";
    await log(`FAILED: ${err instanceof Error ? err.stack ?? err.message : String(err)}`);
    const willRetry = job.attempts < MAX_ATTEMPTS && !(err instanceof EvaluationError);
    if (willRetry) {
      await db.evaluationJob.update({ where: { id: jobId }, data: { lockedAt: null, lockedBy: null } });
      await db.submission.update({ where: { id: sub.id }, data: { status: "QUEUED" } });
      return { submissionId: sub.id, status: "RETRY" };
    }
    await db.submission.update({ where: { id: sub.id }, data: { status: "FAILED", failureMessage: message, completedAt: new Date() } });
    await recordRevision({ submissionId: sub.id, kind: "failure", evaluatorVersion: evaluator.name, note: `attempt ${job.attempts}: ${message}`, by: workerId() });
    await db.evaluationJob.update({ where: { id: jobId }, data: { lockedAt: null, lockedBy: null, attempts: MAX_ATTEMPTS } });
    for (const r of await recipients()) {
      const sent = await evaluationCompleteEmail(r.email, r.name, sub.modelName, sub.id, false, message);
      await log(sent ? `failure email sent to ${r.email}` : `failure email to ${r.email} FAILED — check SMTP_* settings on the worker host`);
    }
    return { submissionId: sub.id, status: "FAILED" };
  }
}
