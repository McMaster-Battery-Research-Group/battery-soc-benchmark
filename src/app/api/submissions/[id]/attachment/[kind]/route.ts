import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { storage } from "@/lib/storage";
import { canViewSubmission } from "@/lib/queries";

export const dynamic = "force-dynamic";

const TYPES: Record<string, string> = { png: "image/png", jpg: "image/jpeg", webp: "image/webp", pdf: "application/pdf" };

/**
 * A submission's description attachments (tracker 2026-10-14 #1): `figure` is the model diagram
 * (PNG / JPEG / WebP), `doc` the write-up (PDF). Served inline, same visibility as the results page.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string; kind: string }> }) {
  const { id, kind } = await params;
  if (kind !== "figure" && kind !== "doc") return NextResponse.json({ error: "Not found" }, { status: 404 });
  const session = await auth();
  const sub = await db.submission.findUnique({ where: { id }, select: { userId: true, isPrivate: true, isHidden: true, figureKey: true, figureName: true, docKey: true, docName: true, collaborators: { select: { userId: true } } } });
  if (!sub || !canViewSubmission(sub, session?.user)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const key = kind === "figure" ? sub.figureKey : sub.docKey;
  const name = (kind === "figure" ? sub.figureName : sub.docName) ?? kind;
  if (!key) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const ext = key.slice(key.lastIndexOf(".") + 1).toLowerCase();
  const type = TYPES[ext];
  if (!type) return NextResponse.json({ error: "Not found" }, { status: 404 });
  let bytes: Buffer;
  try {
    bytes = await storage.getBytes(key);
  } catch {
    return NextResponse.json({ error: "The file is no longer available." }, { status: 404 });
  }
  const safe = name.replace(/[^a-z0-9._-]+/gi, "_").replace(/^_+|_+$/g, "") || kind;
  return new Response(new Uint8Array(bytes), {
    headers: { "Content-Type": type, "Content-Disposition": `inline; filename="${safe}"`, "Content-Length": String(bytes.length), "Cache-Control": "private, max-age=3600", "X-Content-Type-Options": "nosniff" },
  });
}
