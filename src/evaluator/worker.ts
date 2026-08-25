/**
 * Resident evaluation worker: polls the EvaluationJob / DryRun tables and runs
 * whatever is queued.
 *
 *   npm run worker
 *
 * Run exactly ONE instance per environment (a stale second worker with
 * different env would claim jobs). It only makes outbound connections
 * (Postgres, Blob, SMTP), so it can live on a laptop behind NAT/VPN. It
 * writes a heartbeat row every HEARTBEAT_MS so the site can show whether the
 * evaluator is online; if the machine sleeps, submissions simply wait.
 */
import "dotenv/config";
import { hostname } from "os";
import { db } from "@/lib/db";
import { claimNext, runNext, workerId } from "./run-job";
import { getEvaluator } from "./index";

const POLL_MS = 2000;
const HEARTBEAT_MS = 15_000;

async function heartbeat(busyWith: string | null) {
  try {
    await db.workerHeartbeat.upsert({
      where: { id: workerId() },
      create: { id: workerId(), hostname: hostname(), evaluator: getEvaluator().name, busyWith },
      update: { lastSeenAt: new Date(), busyWith, evaluator: getEvaluator().name },
    });
  } catch (err) {
    console.error("[worker] heartbeat failed", err instanceof Error ? err.message : err);
  }
}

async function main() {
  console.log(`[worker] ${workerId()} online — evaluator "${getEvaluator().name}", polling every ${POLL_MS} ms`);
  let busy: string | null = null;
  await heartbeat(null);
  const hb = setInterval(() => void heartbeat(busy), HEARTBEAT_MS);
  const bye = async () => {
    clearInterval(hb);
    try {
      await db.workerHeartbeat.delete({ where: { id: workerId() } });
    } catch {}
    process.exit(0);
  };
  process.on("SIGINT", bye);
  process.on("SIGTERM", bye);

  while (true) {
    try {
      const item = await claimNext();
      if (item) {
        busy = item.id;
        await heartbeat(busy);
        try {
          await runNext(item);
        } finally {
          busy = null;
          await heartbeat(null);
        }
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
