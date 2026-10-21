import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { storage } from "@/lib/storage";
import { canViewSubmission } from "@/lib/queries";
import { logEvent } from "@/lib/log";
import { rateLimit, clientIp, TOO_MANY } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/**
 * The submitted package (.zip), for submissions whose authors chose to share their model files
 * (tracker 2026-10-14 #2). Same visibility as the results page; without the author's opt-in the
 * package was deleted right after evaluation and there is nothing to serve.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const rl = await rateLimit(`package:${await clientIp()}`, 60, 60 * 60_000);
  if (!rl.ok) return NextResponse.json({ error: TOO_MANY(rl.retryAfterSec) }, { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } });
  const session = await auth();
  const sub = await db.submission.findUnique({ where: { id }, select: { id: true, seq: true, userId: true, isPrivate: true, isHidden: true, modelName: true, shareFiles: true, fileKey: true, fileName: true, collaborators: { select: { userId: true } } } });
  if (!sub || !canViewSubmission(sub, session?.user)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!sub.shareFiles || !sub.fileKey) return NextResponse.json({ error: "The authors of this submission did not share its model files." }, { status: 404 });
  let bytes: Buffer;
  try {
    bytes = await storage.getBytes(sub.fileKey);
  } catch {
    return NextResponse.json({ error: "The package is no longer available." }, { status: 404 });
  }
  logEvent("package.downloaded", { id, seq: sub.seq, by: session?.user?.id ?? null, bytes: bytes.length });
  const base = (sub.fileName ?? `${sub.modelName}.zip`).replace(/[^a-z0-9._-]+/gi, "_").replace(/^_+|_+$/g, "") || "model.zip";
  const name = base.toLowerCase().endsWith(".zip") ? base : `${base}.zip`;
  return new Response(new Uint8Array(bytes), {
    headers: { "Content-Type": "application/zip", "Content-Disposition": `attachment; filename="${name}"`, "Content-Length": String(bytes.length), "Cache-Control": "private, max-age=0" },
  });
}
