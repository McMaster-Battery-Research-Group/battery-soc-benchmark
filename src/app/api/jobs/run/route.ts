import { NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { claimNext, runNext } from "@/evaluator/run-job";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

/**
 * On-demand queue drain — lets an external cron process queued evaluations
 * without a resident worker. Only useful where the caller has the blinded data
 * and a sandbox (i.e. it is itself an evaluation host); a 60 s function limit
 * makes it unsuitable for anything but the shortest models.
 *
 *   GET/POST /api/jobs/run
 *   Authorization: Bearer <CRON_SECRET>   (header only — never in the URL)
 */
async function handle(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 503 });
  // Header only — a secret in the query string ends up in access logs and browser history.
  const provided = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!provided || provided.length !== secret.length || !timingSafeEqual(Buffer.from(provided), Buffer.from(secret))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const started = Date.now();
  const results: { submissionId: string; status: string }[] = [];
  // Run jobs until ~45 s have elapsed so we stay inside the function limit.
  while (Date.now() - started < 45_000) {
    const item = await claimNext();
    if (!item) break;
    results.push(await runNext(item));
  }
  return NextResponse.json({ processed: results.length, results, ms: Date.now() - started });
}

export const GET = handle;
export const POST = handle;
