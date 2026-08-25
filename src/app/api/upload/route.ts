import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { storage, SupabaseStorage, MAX_UPLOAD_BYTES } from "@/lib/storage";

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
  const body = (await req.json().catch(() => ({}))) as { name?: string; size?: number; purpose?: string };
  if (!body.name || !body.name.toLowerCase().endsWith(".zip")) return NextResponse.json({ error: "Only .zip packages are accepted" }, { status: 400 });
  if (!body.size || body.size > MAX_UPLOAD_BYTES) return NextResponse.json({ error: `File exceeds the ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)} MB limit` }, { status: 400 });
  try {
    const signed = await storage.createSignedUpload(body.purpose === "dry-run" ? "dry-runs" : "submissions");
    return NextResponse.json(signed);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Upload failed" }, { status: 500 });
  }
}
