import { NextResponse } from "next/server";
import { claimJob, runJob } from "@/evaluator/run-job";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

/**
 * On-demand queue drain — lets a free external cron (cron-job.org, GitHub
 * Actions, Vercel Cron) process queued evaluations without a resident worker.
 * Only sensible with the mock evaluator (seconds per job); the MATLAB
 * evaluator needs the real worker on a MATLAB host.
 *
 *   GET/POST /api/jobs/run
 *   Authorization: Bearer <CRON_SECRET>   (or ?secret=<CRON_SECRET>)
 */
async function handle(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 503 });
  const url = new URL(req.url);
  const provided = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? url.searchParams.get("secret");
  if (provided !== secret) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const started = Date.now();
  const results: { submissionId: string; status: string }[] = [];
  // Run jobs until ~45 s have elapsed so we stay inside the function limit.
  while (Date.now() - started < 45_000) {
    const job = await claimJob();
    if (!job) break;
    results.push(await runJob(job.id));
  }
  return NextResponse.json({ processed: results.length, results, ms: Date.now() - started });
}

export const GET = handle;
export const POST = handle;
