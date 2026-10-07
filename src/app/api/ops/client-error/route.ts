import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { recordAdminEvent } from "@/lib/admin-notify";
import { clientErrorEmail } from "@/lib/mail";

/**
 * The error page posts here when it renders, so administrators hear about crashes without anyone
 * filling in a form. Throttled per error reference: logged every time, e-mailed once an hour.
 */
const seen = new Map<string, { count: number; emailedAt: number }>();
const HOUR = 3_600_000;

export async function POST(req: Request) {
  let body: { digest?: string; url?: string; message?: string } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  const digest = String(body.digest ?? "no-digest").slice(0, 80);
  const url = String(body.url ?? "").slice(0, 300);
  const message = String(body.message ?? "").slice(0, 300);
  const userAgent = (req.headers.get("user-agent") ?? "").slice(0, 200);
  const session = await auth().catch(() => null);
  const user = session?.user ? `${session.user.name} <${session.user.email}>` : "not signed in";

  const now = Date.now();
  const entry = seen.get(digest) ?? { count: 0, emailedAt: 0 };
  if (now - entry.emailedAt > HOUR) entry.count = 0;
  entry.count++;
  seen.set(digest, entry);
  if (seen.size > 500) seen.delete(seen.keys().next().value!);

  await recordAdminEvent("errors", `Page error ${digest.slice(0, 8)} on ${url.replace(/^https?:\/\/[^/]+/, "") || "/"} (${user})${message ? `: ${message}` : ""}`);
  let emailed = false;
  if (now - entry.emailedAt > HOUR) {
    entry.emailedAt = now;
    emailed = await clientErrorEmail({ digest, url, message, userAgent, user, count: entry.count });
  }
  return NextResponse.json({ ok: true, emailed });
}
