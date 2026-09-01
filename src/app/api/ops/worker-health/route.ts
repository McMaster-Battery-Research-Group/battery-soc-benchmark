import { NextRequest, NextResponse } from "next/server";
import { createHash, timingSafeEqual } from "node:crypto";
import { db } from "@/lib/db";
import { recordAdminEvent } from "@/lib/admin-notify";
import { workerAlertEmail } from "@/lib/mail";

// Dead-man's switch for the evaluation workers. A worker that loses its network path to the
// database (the Sept 1 Arbutus routing outage) looks exactly like a dead worker from here — no
// heartbeats — and the web tier is the only vantage point that still sees both the database and
// SMTP. A GitHub Actions schedule (.github/workflows/worker-health.yml) calls this every 10 min;
// admins are e-mailed on state transitions only (one alert per outage, one all-clear), with the
// current state remembered as the latest kind="ops" row in the admin activity feed.

export const dynamic = "force-dynamic";

/** 12 missed 15-second heartbeats — long enough that a vm-update.sh restart never trips it. */
const OFFLINE_AFTER_MS = 3 * 60_000;
const RUNTIMES = ["python", "matlab"] as const;
const RECOVERED_TEXT = "Workers recovered — evaluation service is back to normal.";

function tokenOk(req: NextRequest): boolean {
  const secret = process.env.OPS_HEALTH_TOKEN;
  if (!secret) return false;
  const given = req.nextUrl.searchParams.get("token") ?? req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const digest = (s: string) => createHash("sha256").update(s).digest();
  return timingSafeEqual(digest(given), digest(secret));
}

export async function GET(req: NextRequest) {
  if (!process.env.OPS_HEALTH_TOKEN) return NextResponse.json({ error: "OPS_HEALTH_TOKEN is not configured" }, { status: 503 });
  if (!tokenOk(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const since = new Date(Date.now() - OFFLINE_AFTER_MS);
  const [workers, backlog] = await Promise.all([
    db.workerHeartbeat.findMany({ select: { hostname: true, lastSeenAt: true, paused: true, runtimes: true } }),
    Promise.all(
      RUNTIMES.map(async (rt) => ({
        rt,
        // runtime null = legacy rows claimable by any worker
        queued: await db.submission.count({ where: { status: "QUEUED", OR: [{ runtime: rt }, { runtime: null }] } }),
        running: await db.submission.count({ where: { status: "RUNNING", OR: [{ runtime: rt }, { runtime: null }] } }),
      })),
    ),
  ]);
  const online = workers.filter((w) => !w.paused && w.lastSeenAt >= since);
  const label = (rt: string) => (rt === "matlab" ? "MATLAB" : "Python");

  // Problem sentences are deliberately count-free: the latest kind="ops" activity row is the
  // remembered state, and a changing queue count must not read as a new outage.
  const problems: string[] = [];
  const details: string[] = [];
  if (!online.length) {
    problems.push("No evaluation worker is online.");
    const lastSeen = workers.map((w) => w.lastSeenAt).sort((a, b) => b.getTime() - a.getTime())[0];
    details.push(lastSeen ? `Last heartbeat from any worker: ${lastSeen.toISOString()}.` : "No worker has ever reported in.");
    details.push(
      "The worker process may still be running but unable to reach the database (as in the Sept 1, 2026 Arbutus routing outage) — SSH to the machine and check `systemctl status socbench-worker` before restarting anything.",
    );
  } else {
    for (const b of backlog) {
      if (b.queued + b.running > 0 && !online.some((w) => w.runtimes.split(",").some((r) => r.trim() === b.rt)))
        problems.push(`Work is waiting for ${label(b.rt)} but no ${label(b.rt)}-capable worker is online.`);
    }
  }
  for (const b of backlog) if (b.queued + b.running > 0) details.push(`${label(b.rt)}: ${b.queued} queued, ${b.running} running.`);

  const lastEvent = await db.adminEvent.findFirst({ where: { kind: "ops" }, orderBy: { createdAt: "desc" }, select: { text: true } });
  let notified = false;
  if (problems.length) {
    const text = `Worker alert: ${problems.join(" ")}`;
    if (lastEvent?.text !== text) {
      await recordAdminEvent("ops", text);
      await workerAlertEmail("Evaluation worker alert", [
        ...problems,
        ...details,
        "You will get one e-mail per state change and an all-clear when service recovers (Admin → My notifications → Worker outages).",
      ]).catch((e) => console.error("[worker-health] alert e-mail failed:", e instanceof Error ? e.message : e));
      notified = true;
    }
  } else if (lastEvent && lastEvent.text.startsWith("Worker alert:")) {
    await recordAdminEvent("ops", RECOVERED_TEXT);
    await workerAlertEmail("Evaluation workers recovered", [
      RECOVERED_TEXT,
      `Online: ${online.map((w) => w.hostname).join(", ")}.`,
      ...details,
    ]).catch((e) => console.error("[worker-health] all-clear e-mail failed:", e instanceof Error ? e.message : e));
    notified = true;
  }

  return NextResponse.json({
    ok: !problems.length,
    problems,
    notified,
    workersOnline: online.map((w) => ({ hostname: w.hostname, runtimes: w.runtimes })),
    backlog: Object.fromEntries(backlog.map((b) => [b.rt, { queued: b.queued, running: b.running }])),
  });
}
