"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { auth } from "@/lib/auth";

export async function registerForContestAction(contestId: string, teamName: string) {
  const session = await auth();
  if (!session?.user) redirect(`/login?next=/contest`);
  const contest = await db.contest.findUnique({ where: { id: contestId } });
  const now = new Date();
  if (!contest || contest.status !== "OPEN" || contest.startsAt > now || contest.endsAt < now) throw new Error("Registration is closed for this contest.");
  await db.contestEntry.upsert({
    where: { contestId_userId: { contestId, userId: session.user.id } },
    create: { contestId, userId: session.user.id, teamName: teamName.trim() || null },
    update: { teamName: teamName.trim() || null },
  });
  revalidatePath(`/contest/${contest.slug}`);
}
