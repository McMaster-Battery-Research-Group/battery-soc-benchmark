import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { storage } from "@/lib/storage";
import { canViewSubmission } from "@/lib/queries";
import { logEvent } from "@/lib/log";

export const dynamic = "force-dynamic";

/** Full-resolution traces (MATLAB v7 .mat, scipy-readable): every evaluation run at 1 Hz. Same visibility rules as the results page. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  const sub = await db.submission.findUnique({ where: { id }, include: { collaborators: { select: { userId: true } }, result: { select: { tracesKey: true } } } });
  if (!sub || !canViewSubmission(sub, session?.user)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!sub.result?.tracesKey) return NextResponse.json({ error: "No full-resolution traces were stored for this result (evaluated before 2026-08-30). Submit a new version to get them." }, { status: 404 });
  const bytes = await storage.getBytes(sub.result.tracesKey);
  logEvent("traces.downloaded", { id, seq: sub.seq, by: session?.user?.id ?? null, bytes: bytes.length });
  const name = `${sub.modelName.replace(/[^a-z0-9]+/gi, "_")}-soc-benchmark-traces.mat`;
  return new Response(new Uint8Array(bytes), { headers: { "Content-Type": "application/octet-stream", "Content-Disposition": `attachment; filename="${name}"`, "Content-Length": String(bytes.length), "Cache-Control": "private, max-age=0" } });
}
