import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { storage, SupabaseStorage, MAX_UPLOAD_BYTES } from "@/lib/storage";
import { rateLimit, TOO_MANY } from "@/lib/rate-limit";
import { logEvent } from "@/lib/log";

/**
 * Issues a short-lived signed upload URL so the browser can PUT a submission
 * package straight into the private Supabase bucket (bypassing the serverless
 * body limit). Only signed-in users; only .zip up to MAX_UPLOAD_MB (the bucket
 * enforces the size limit and MIME types server-side as well).
 */
export async function POST(req: Request) {
  if (!(storage instanceof SupabaseStorage)) return NextResponse.json({ error: "Direct upload disabled" }, { status: 404 });
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const rl = await rateLimit(`upload:user:${session.user.id}`, 30, 60 * 60_000);
  if (!rl.ok) return NextResponse.json({ error: TOO_MANY(rl.retryAfterSec) }, { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } });
  const body = (await req.json().catch(() => ({}))) as { name?: string; size?: number; purpose?: string };
  if (!body.name || !body.name.toLowerCase().endsWith(".zip")) return NextResponse.json({ error: "Only .zip packages are accepted" }, { status: 400 });
  if (!body.size || body.size > MAX_UPLOAD_BYTES) return NextResponse.json({ error: `File exceeds the ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)} MB limit` }, { status: 400 });
  try {
    const signed = await storage.createSignedUpload(body.purpose === "dry-run" ? "dry-runs" : "submissions");
    logEvent("upload.signed", { userId: session.user.id, purpose: body.purpose ?? "submission", name: body.name, sizeKB: Math.round(body.size / 1024), key: signed.key });
    return NextResponse.json(signed);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Upload failed" }, { status: 500 });
  }
}
