import { headers } from "next/headers";
import { db } from "@/lib/db";

/**
 * DB-backed sliding-window rate limiter (Vercel functions are stateless, so
 * in-memory counters would not work). `key` should be namespaced, e.g.
 * `login:ip:1.2.3.4` or `register:ip:…`.
 */
export async function rateLimit(key: string, limit: number, windowMs: number): Promise<{ ok: boolean; retryAfterSec: number }> {
  const since = new Date(Date.now() - windowMs);
  const count = await db.rateLimitHit.count({ where: { key, createdAt: { gt: since } } });
  if (count >= limit) {
    const oldest = await db.rateLimitHit.findFirst({ where: { key, createdAt: { gt: since } }, orderBy: { createdAt: "asc" }, select: { createdAt: true } });
    const retryAfterSec = oldest ? Math.max(1, Math.ceil((oldest.createdAt.getTime() + windowMs - Date.now()) / 1000)) : Math.ceil(windowMs / 1000);
    return { ok: false, retryAfterSec };
  }
  await db.rateLimitHit.create({ data: { key } });
  if (Math.random() < 0.02) void db.rateLimitHit.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - 24 * 3600_000) } } }).catch(() => {});
  return { ok: true, retryAfterSec: 0 };
}

/** Best-effort client IP (Vercel sets x-forwarded-for; first hop is the client). */
export async function clientIp(): Promise<string> {
  const h = await headers();
  return (h.get("x-forwarded-for") ?? "").split(",")[0].trim() || h.get("x-real-ip") || "unknown";
}

export function retryText(sec: number) {
  return sec < 90 ? `${sec} seconds` : `${Math.ceil(sec / 60)} minutes`;
}

/** Generic message for forms. */
export const TOO_MANY = (sec: number) => `Too many attempts. Please try again in ${retryText(sec)}.`;
