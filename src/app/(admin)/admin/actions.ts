"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { contestSchema, zodErrors, type FieldErrors } from "@/lib/validation";

export async function toggleHiddenAction(id: string, isHidden: boolean) {
  await requireAdmin();
  await db.submission.update({ where: { id }, data: { isHidden } });
  revalidatePath("/leaderboard");
  revalidatePath(`/submissions/${id}`);
  revalidatePath("/admin/submissions");
}

export async function setRoleAction(userId: string, role: "USER" | "ADMIN") {
  const me = await requireAdmin();
  if (me.id === userId) throw new Error("You cannot change your own role");
  await db.user.update({ where: { id: userId }, data: { role } });
  revalidatePath("/admin/users");
}

export async function verifyUserAction(userId: string) {
  await requireAdmin();
  await db.user.update({ where: { id: userId }, data: { emailVerified: new Date() } });
  revalidatePath("/admin/users");
}

export async function resolveMessageAction(id: string, resolved: boolean) {
  await requireAdmin();
  await db.contactMessage.update({ where: { id }, data: { resolved } });
  revalidatePath("/admin/messages");
}

export interface ContestFormState {
  errors?: FieldErrors;
  values?: Record<string, string>;
}

export async function saveContestAction(_prev: ContestFormState, fd: FormData): Promise<ContestFormState> {
  await requireAdmin();
  const id = String(fd.get("id") ?? "");
  const keys = ["title", "slug", "summary", "description", "rules", "prizeText", "startsAt", "endsAt", "status", "maxSubmissionsPerUser"];
  const values = Object.fromEntries(keys.map((k) => [k, String(fd.get(k) ?? "")]));
  const parsed = contestSchema.safeParse(values);
  if (!parsed.success) return { errors: zodErrors(parsed.error), values };
  const clash = await db.contest.findUnique({ where: { slug: parsed.data.slug } });
  if (clash && clash.id !== id) return { errors: { slug: "Another contest already uses this slug" }, values };

  if (parsed.data.status === "OPEN") {
    // Only one open contest at a time keeps the "current contest" UI unambiguous.
    await db.contest.updateMany({ where: { status: "OPEN", ...(id ? { id: { not: id } } : {}) }, data: { status: "CLOSED" } });
  }
  const contest = id
    ? await db.contest.update({ where: { id }, data: parsed.data })
    : await db.contest.create({ data: parsed.data });
  revalidatePath("/contest");
  revalidatePath(`/contest/${contest.slug}`);
  revalidatePath("/admin/contests");
  redirect(`/admin/contests/${contest.id}?saved=1`);
}

export async function deleteContestAction(id: string) {
  await requireAdmin();
  await db.contest.delete({ where: { id } });
  revalidatePath("/contest");
  redirect("/admin/contests");
}
