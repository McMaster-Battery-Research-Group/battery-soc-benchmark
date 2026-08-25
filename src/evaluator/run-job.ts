/**
 * Claim-and-run one evaluation job. Shared by the long-running worker
 * (worker.ts) and the on-demand API route (/api/jobs/run) so the queue can be
 * drained either by a resident process or by an external cron ping.
 */
import { hostname } from "os";
import { db } from "@/lib/db";
import { storage } from "@/lib/storage";
import { evaluationCompleteEmail } from "@/lib/mail";
import { getEvaluator } from "./index";
import { EvaluationError } from "./types";

export const STALE_LOCK_MS = 30 * 60 * 1000;
export const MAX_ATTEMPTS = 2;

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

export async function runJob(jobId: string): Promise<{ submissionId: string; status: "COMPLETED" | "FAILED" | "RETRY" }> {
  const evaluator = getEvaluator();
  const job = await db.evaluationJob.findUnique({ where: { id: jobId }, include: { submission: { include: { user: true } } } });
  if (!job) throw new Error("job vanished");
  const sub = job.submission;
  const log = async (line: string) => {
    const stamped = `${new Date().toISOString()} ${line}\n`;
    process.stdout.write(`[${sub.seq}] ${line}\n`);
    const cur = await db.evaluationJob.findUnique({ where: { id: jobId }, select: { log: true } });
    await db.evaluationJob.update({ where: { id: jobId }, data: { log: (cur?.log ?? "") + stamped } });
  };

  await db.submission.update({ where: { id: sub.id }, data: { status: "RUNNING" } });
  await log(`${workerId()} started evaluation with "${evaluator.name}" evaluator (attempt ${job.attempts})`);

  try {
    const localPath = await storage.materialize(sub.fileKey);
    await log(`package ready at ${localPath}`);
    const out = await evaluator.evaluate({ submissionId: sub.id, filePath: localPath, fileType: sub.fileType, modelType: sub.modelType, evaluationLevel: sub.evaluationLevel, log });
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
    await storage.remove(sub.fileKey); // packages are deleted immediately after evaluation
    await evaluationCompleteEmail(sub.user.email, sub.user.name, sub.modelName, sub.id, true, `All-cells RMSE: ${out.allCells.toFixed(2)} %, weighted error: ${out.weightedError.toFixed(2)} %.`);
    return { submissionId: sub.id, status: "COMPLETED" };
  } catch (err) {
    const message = err instanceof EvaluationError && err.userFacing ? err.message : "The evaluator encountered an internal error. The administrators have been notified.";
    await log(`FAILED: ${err instanceof Error ? err.stack ?? err.message : String(err)}`);
    const willRetry = job.attempts < MAX_ATTEMPTS && !(err instanceof EvaluationError);
    if (willRetry) {
      await db.evaluationJob.update({ where: { id: jobId }, data: { lockedAt: null, lockedBy: null } });
      await db.submission.update({ where: { id: sub.id }, data: { status: "QUEUED" } });
      return { submissionId: sub.id, status: "RETRY" };
    }
    await db.submission.update({ where: { id: sub.id }, data: { status: "FAILED", failureMessage: message, completedAt: new Date() } });
    await db.evaluationJob.update({ where: { id: jobId }, data: { lockedAt: null, lockedBy: null, attempts: MAX_ATTEMPTS } });
    await evaluationCompleteEmail(sub.user.email, sub.user.name, sub.modelName, sub.id, false, message);
    return { submissionId: sub.id, status: "FAILED" };
  }
}
