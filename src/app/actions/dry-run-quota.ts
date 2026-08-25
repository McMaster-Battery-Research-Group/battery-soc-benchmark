"use server";

import { auth } from "@/lib/auth";
import { dryRunQuota, type DryRunQuota } from "@/lib/dry-run-quota";

/** Current user's dry-run quota (null when signed out). */
export async function getDryRunQuotaAction(): Promise<DryRunQuota | null> {
  const session = await auth();
  if (!session?.user) return null;
  return dryRunQuota(session.user);
}
