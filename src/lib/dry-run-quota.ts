import { db } from "@/lib/db";

/** Dry runs are rate-limited per user on a rolling window (examples and own packages share the same quota). Administrators are exempt. */
export const DRY_RUNS_PER_HOUR = 5;
const WINDOW_MS = 3600_000;

export type DryRunQuota = {
  used: number;
  limit: number;
  remaining: number;
  /** ms until the next slot frees up (0 if one is free now) */
  resetInMs: number;
  /** true for administrators — no limit applies */
  unlimited: boolean;
};

export type QuotaUser = { id: string; role?: string | null };

export async function dryRunQuota(user: QuotaUser): Promise<DryRunQuota> {
  const since = new Date(Date.now() - WINDOW_MS);
  const recent = await db.dryRun.findMany({ where: { userId: user.id, createdAt: { gt: since } }, orderBy: { createdAt: "asc" }, select: { createdAt: true } });
  const used = recent.length;
  if (user.role === "ADMIN") return { used, limit: DRY_RUNS_PER_HOUR, remaining: Number.POSITIVE_INFINITY, resetInMs: 0, unlimited: true };
  const remaining = Math.max(0, DRY_RUNS_PER_HOUR - used);
  // The oldest run inside the window is the next one to age out.
  const oldest = used >= DRY_RUNS_PER_HOUR ? recent[used - DRY_RUNS_PER_HOUR].createdAt.getTime() : null;
  const resetInMs = oldest === null ? 0 : Math.max(0, oldest + WINDOW_MS - Date.now());
  return { used, limit: DRY_RUNS_PER_HOUR, remaining, resetInMs, unlimited: false };
}

export function formatWait(ms: number) {
  const min = Math.ceil(ms / 60_000);
  if (min < 1) return "under a minute";
  if (min === 1) return "about 1 minute";
  return `about ${min} minutes`;
}

/** Returns a user-facing error if the user is over quota, else null. */
export async function dryRunLimitError(user: QuotaUser) {
  const q = await dryRunQuota(user);
  if (q.unlimited || q.remaining > 0) return null;
  return `Limit reached: ${q.limit} test runs per hour. Your next run frees up in ${formatWait(q.resetInMs)}.`;
}
