import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { canViewSubmission } from "@/lib/queries";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  const sub = await db.submission.findUnique({ where: { id }, include: { job: { select: { log: true } } } });
  if (!sub || !canViewSubmission(sub, session?.user)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const owner = session?.user?.id === sub.userId || session?.user?.role === "ADMIN";
  return NextResponse.json({ status: sub.status, log: owner ? sub.job?.log ?? "" : "", failureMessage: sub.failureMessage });
}
