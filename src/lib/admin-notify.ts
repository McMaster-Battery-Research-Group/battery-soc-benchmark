import { db } from "@/lib/db";

// Server-only. Kept out of admin-list.ts because that file is imported by the
// Edge middleware (via auth.config.ts) and must not pull in Prisma.

/** Where admin notifications go: ADMIN_NOTIFY_EMAIL (comma-separated) if set, otherwise every ADMIN account. */
export async function adminNotifyTargets(): Promise<string[]> {
  const fixed = (process.env.ADMIN_NOTIFY_EMAIL ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  if (fixed.length) return fixed;
  return (await db.user.findMany({ where: { role: "ADMIN" }, select: { email: true } })).map((u) => u.email);
}
