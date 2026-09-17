import { NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { storage, MAX_UPLOAD_BYTES } from "@/lib/storage";

/**
 * Package storage for the evaluation worker when the web host keeps the files
 * on its own disk (web: STORAGE=local, worker: STORAGE=remote).
 *
 *   GET    ?key=…   download      HEAD ?key=…   exists
 *   DELETE ?key=…   remove        POST ?ext=mat upload (result traces) → { key }
 *
 *   Authorization: Bearer <STORAGE_REMOTE_TOKEN>   (header only — never in the URL)
 *
 * Disabled (404) unless STORAGE_REMOTE_TOKEN is set on a STORAGE=local host.
 */
const KEY_RE = /^\d{10,16}-[a-f0-9]{12}\.(zip|mat|py)$/;

function guard(req: Request): NextResponse | null {
  const secret = process.env.STORAGE_REMOTE_TOKEN;
  if (!secret || storage.mode !== "local") return NextResponse.json({ error: "Not found" }, { status: 404 });
  const provided = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!provided || provided.length !== secret.length || !timingSafeEqual(Buffer.from(provided), Buffer.from(secret))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return null;
}
function keyOf(req: Request): string | null {
  const key = new URL(req.url).searchParams.get("key") ?? "";
  return KEY_RE.test(key) ? key : null;
}

export async function GET(req: Request) {
  const denied = guard(req);
  if (denied) return denied;
  const key = keyOf(req);
  if (!key || !(await storage.exists(key))) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const bytes = await storage.getBytes(key);
  return new NextResponse(new Uint8Array(bytes), { headers: { "Content-Type": "application/octet-stream", "Cache-Control": "no-store" } });
}

export async function HEAD(req: Request) {
  const denied = guard(req);
  if (denied) return new NextResponse(null, { status: denied.status });
  const key = keyOf(req);
  return new NextResponse(null, { status: key && (await storage.exists(key)) ? 200 : 404 });
}

export async function DELETE(req: Request) {
  const denied = guard(req);
  if (denied) return denied;
  const key = keyOf(req);
  if (!key) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await storage.remove(key);
  return NextResponse.json({ ok: true });
}

export async function POST(req: Request) {
  const denied = guard(req);
  if (denied) return denied;
  const ext = new URL(req.url).searchParams.get("ext");
  if (ext !== "zip" && ext !== "mat" && ext !== "py") return NextResponse.json({ error: "Bad extension" }, { status: 400 });
  const bytes = Buffer.from(await req.arrayBuffer());
  if (!bytes.length || bytes.length > MAX_UPLOAD_BYTES) return NextResponse.json({ error: "Bad size" }, { status: 400 });
  return NextResponse.json({ key: await storage.put(bytes, ext) });
}
