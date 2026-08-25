/**
 * Evaluation worker: polls the EvaluationJob table, runs the configured
 * evaluator, persists results, emails the submitter.
 *
 *   npm run worker
 *
 * Safe to run multiple instances — jobs are claimed with an atomic update.
 */
import "dotenv/config";
import { hostname } from "os";
import { db } from "@/lib/db";
import { storage } from "@/lib/storage";
import { evaluationCompleteEmail } from "@/lib/mail";
import { getEvaluator } from "./index";
import { EvaluationError } from "./types";

const POLL_MS = 2000;
const STALE_LOCK_MS = 30 * 60 * 1000;
const MAX_ATTEMPTS = 2;
const workerId = `${hostname()}-${process.pid}`;
const evaluator = getEvaluator();

async function claimJob() {
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
    data: { lockedAt: new Date(), lockedBy: workerId, attempts: { increment: 1 } },
  });
  return count === 1 ? candidate : null;
}

async function run(jobId: string) {
  const job = await db.evaluationJob.findUnique({ where: { id: jobId }, include: { submission: { include: { user: true } } } });
  if (!job) return;
  const sub = job.submission;
  const log = async (line: string) => {
    const stamped = `${new Date().toISOString()} ${line}\n`;
    process.stdout.write(`[${sub.seq}] ${line}\n`);
    await db.evaluationJob.update({ where: { id: jobId }, data: { log: { set: (await db.evaluationJob.findUnique({ where: { id: jobId }, select: { log: true } }))!.log + stamped } } });
  };

  await db.submission.update({ where: { id: sub.id }, data: { status: "RUNNING" } });
  await log(`worker ${workerId} started evaluation with "${evaluator.name}" evaluator (attempt ${job.attempts})`);

  try {
    const localPath = await storage.materialize(sub.fileKey);
    await log(`package ready at ${localPath}`);
    const out = await evaluator.evaluate({
      submissionId: sub.id,
      filePath: localPath,
      fileType: sub.fileType,
      modelType: sub.modelType,
      evaluationLevel: sub.evaluationLevel,
      log,
    });
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
    // Model files are deleted immediately after evaluation, as promised to submitters.
    await storage.remove(sub.fileKey);
    await evaluationCompleteEmail(sub.user.email, sub.user.name, sub.modelName, sub.id, true, `All-cells RMSE: ${out.allCells.toFixed(2)} %, weighted error: ${out.weightedError.toFixed(2)} %.`);
  } catch (err) {
    const message = err instanceof EvaluationError && err.userFacing ? err.message : "The evaluator encountered an internal error. The administrators have been notified.";
    await log(`FAILED: ${err instanceof Error ? err.stack ?? err.message : String(err)}`);
    const willRetry = job.attempts < MAX_ATTEMPTS && !(err instanceof EvaluationError);
    if (willRetry) {
      await db.evaluationJob.update({ where: { id: jobId }, data: { lockedAt: null, lockedBy: null } });
      await db.submission.update({ where: { id: sub.id }, data: { status: "QUEUED" } });
      return;
    }
    await db.submission.update({ where: { id: sub.id }, data: { status: "FAILED", failureMessage: message, completedAt: new Date() } });
    await db.evaluationJob.update({ where: { id: jobId }, data: { lockedAt: null, lockedBy: null, attempts: MAX_ATTEMPTS } });
    await evaluationCompleteEmail(sub.user.email, sub.user.name, sub.modelName, sub.id, false, message);
  }
}

async function main() {
  console.log(`[worker] ${workerId} online — evaluator "${evaluator.name}", polling every ${POLL_MS} ms`);
  while (true) {
    try {
      const job = await claimJob();
      if (job) {
        await run(job.id);
        continue;
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
