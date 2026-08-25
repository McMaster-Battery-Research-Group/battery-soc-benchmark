/**
 * Resident evaluation worker: polls the EvaluationJob table and runs jobs.
 *
 *   npm run worker
 *
 * Safe to run multiple instances — jobs are claimed atomically. For a
 * zero-infrastructure alternative (mock evaluator only) see /api/jobs/run.
 */
import "dotenv/config";
import { claimJob, runJob, workerId } from "./run-job";
import { getEvaluator } from "./index";

const POLL_MS = 2000;

async function main() {
  console.log(`[worker] ${workerId()} online — evaluator "${getEvaluator().name}", polling every ${POLL_MS} ms`);
  while (true) {
    try {
      const job = await claimJob();
      if (job) {
        await runJob(job.id);
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
