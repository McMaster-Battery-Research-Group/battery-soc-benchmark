"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
import { ELIGIBILITY, registrationOpen } from "@/lib/contest";

export async function registerForContestAction(contestId: string, form: { teamName: string; teamMembers: string[]; eligibilityConfirmed: boolean }): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await auth();
  if (!session?.user) redirect(`/login?next=/contest`);
  const contest = await db.contest.findUnique({ where: { id: contestId } });
  if (!contest || !registrationOpen(contest)) return { ok: false, error: "Registration is closed for this contest." };
  const members = form.teamMembers.map((m) => m.trim().slice(0, 80)).filter(Boolean);
  if (members.length > contest.maxTeamSize - 1) {
    return { ok: false, error: contest.maxTeamSize === 1 ? "This contest is for individual entries." : `Teams can have at most ${contest.maxTeamSize} people, including you.` };
  }
  const needsStatement = !!ELIGIBILITY[contest.eligibility]?.statement;
  if (needsStatement && !form.eligibilityConfirmed) return { ok: false, error: "Confirm that you meet the eligibility requirement." };
  const data = { teamName: form.teamName.trim().slice(0, 60) || null, teamMembers: members, eligibilityConfirmed: needsStatement && form.eligibilityConfirmed };
  await db.contestEntry.upsert({
    where: { contestId_userId: { contestId, userId: session.user.id } },
    create: { contestId, userId: session.user.id, ...data },
    update: data,
  });
  revalidatePath(`/contest/${contest.slug}`);
  return { ok: true };
}
