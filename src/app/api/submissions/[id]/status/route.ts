import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { canViewSubmission } from "@/lib/queries";
import { getEvaluatorStatus, queuePosition } from "@/lib/worker-status";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  const sub = await db.submission.findUnique({ where: { id }, include: { job: { select: { log: true } }, collaborators: { select: { userId: true } } } });
  if (!sub || !canViewSubmission(sub, session?.user)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const insider = session?.user?.id === sub.userId || session?.user?.role === "ADMIN" || sub.collaborators.some((c) => c.userId === session?.user?.id);
  const pending = sub.status === "QUEUED" || sub.status === "RUNNING";
  const [ev, pos] = pending ? await Promise.all([getEvaluatorStatus(), sub.status === "QUEUED" ? queuePosition(id) : Promise.resolve(null)]) : [null, null];
  return NextResponse.json({
    status: sub.status,
    log: insider ? sub.job?.log ?? "" : "",
    failureMessage: sub.failureMessage,
    evaluator: ev ? { online: ev.online, lastSeenAt: ev.lastSeenAt, queued: ev.queued, running: ev.running, capacity: ev.capacity } : null,
    queuePosition: pos,
  });
}
