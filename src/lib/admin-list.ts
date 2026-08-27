/**
 * Accounts listed in ADMIN_EMAILS (comma-separated) are administrators:
 * promoted automatically on registration and on sign-in, exempt from the
 * dry-run rate limit, and shown with an Administrator badge. Admins can also be
 * granted/revoked from /admin/users.
 */
export function adminEmails(): Set<string> {
  return new Set(
    (process.env.ADMIN_EMAILS ?? "")
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  );
}

export const isListedAdmin = (email: string) => adminEmails().has(email.toLowerCase().trim());

/** Where admin notifications go: ADMIN_NOTIFY_EMAIL (comma-separated) if set, otherwise every ADMIN account. */
export async function adminNotifyTargets(): Promise<string[]> {
  const fixed = (process.env.ADMIN_NOTIFY_EMAIL ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  if (fixed.length) return fixed;
  const { db } = await import("@/lib/db");
  return (await db.user.findMany({ where: { role: "ADMIN" }, select: { email: true } })).map((u) => u.email);
}
