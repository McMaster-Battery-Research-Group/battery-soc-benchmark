import { db } from "@/lib/db";

// Server-only. Kept out of admin-list.ts because that file is imported by the
// Edge middleware (via auth.config.ts) and must not pull in Prisma.

/** Event classes an administrator can mute individually (Admin → My notifications). */
export const ADMIN_NOTIFY_KINDS = [
  { key: "feedback", label: "Contact & feedback messages", desc: "Every message sent through the contact form." },
  { key: "accounts", label: "Accounts", desc: "Someone registers, or an account completes e-mail verification." },
  { key: "roles", label: "Administrator changes", desc: "Admin access is granted or revoked (sent to the person, all admins in CC)." },
  { key: "deletions", label: "Submission deletions", desc: "A submission is deleted, by its owner or by an administrator." },
  { key: "workers", label: "Worker outages", desc: "Evaluation workers stop reporting in, or queued work has no compatible worker, plus the all-clear when service recovers." },
  { key: "errors", label: "Page errors", desc: "A visitor hits the error page. The reference, address and browser are sent so it can be matched with the server log; one e-mail per error per hour." },
  { key: "security", label: "Security alerts", desc: "A submission trips a security guard during evaluation (e.g. a forged result rejected, a model that tries to exit abnormally, or a run flagged suspicious)." },
] as const;
export type AdminNotifyKind = (typeof ADMIN_NOTIFY_KINDS)[number]["key"];
export type AdminNotifyPrefs = Partial<Record<AdminNotifyKind, boolean>>;

/**
 * Where admin notifications of `kind` go: ADMIN_NOTIFY_EMAIL (comma-separated) if set — a fixed list
 * that ignores per-admin preferences — otherwise every ADMIN account that has not switched that
 * event class off (no preference stored = everything on).
 */
export async function adminNotifyTargets(kind?: AdminNotifyKind): Promise<string[]> {
  const fixed = (process.env.ADMIN_NOTIFY_EMAIL ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  if (fixed.length) return fixed;
  const admins = await db.user.findMany({ where: { role: "ADMIN" }, select: { email: true, adminNotify: true } });
  return admins.filter((u) => !kind || (u.adminNotify as AdminNotifyPrefs | null)?.[kind] !== false).map((u) => u.email);
}

/**
 * Persist one line of admin activity (shown on Admin → Overview). Always recorded, regardless of
 * anyone's e-mail toggles — the site is the source of truth; e-mail is just the push channel.
 * Fire-and-forget: activity must never break the action that caused it.
 */
export async function recordAdminEvent(kind: string, text: string): Promise<void> {
  try {
    await db.adminEvent.create({ data: { kind, text: text.slice(0, 500) } });
  } catch (e) {
    console.error("[admin-event] not recorded:", e instanceof Error ? e.message : e);
  }
}
