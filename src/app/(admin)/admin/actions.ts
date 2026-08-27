"use server";

import { logEvent } from "@/lib/log";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { contestSchema, zodErrors, type FieldErrors } from "@/lib/validation";
import { moderationEmail } from "@/lib/mail";
import { storage } from "@/lib/storage";

// ---- evaluation workers

/** Queue a command for a worker; it is picked up at its next heartbeat (≤ 15 s). */
export async function workerCommandAction(workerId: string, command: "pause" | "resume" | "stop") {
  await requireAdmin();
  await db.workerHeartbeat.update({ where: { id: workerId }, data: { command } });
  logEvent("admin.worker_command", { workerId, command });
  revalidatePath("/admin/workers");
}

/** Remove the row of a worker that is no longer running (crashed / machine off without a clean exit). */
export async function forgetWorkerAction(workerId: string) {
  await requireAdmin();
  await db.workerHeartbeat.delete({ where: { id: workerId } });
  revalidatePath("/admin/workers");
}

/** Release a job lock so another worker can claim it (e.g. the machine died mid-evaluation). */
export async function releaseJobAction(submissionId: string) {
  await requireAdmin();
  await db.$transaction([
    db.evaluationJob.update({ where: { submissionId }, data: { lockedAt: null, lockedBy: null } }),
    db.submission.update({ where: { id: submissionId }, data: { status: "QUEUED" } }),
  ]);
  revalidatePath("/admin/workers");
  revalidatePath(`/submissions/${submissionId}`);
}

/** Give a failed / exhausted job another full set of attempts. */
export async function retryJobAction(submissionId: string) {
  await requireAdmin();
  await db.$transaction([
    db.evaluationJob.upsert({ where: { submissionId }, create: { submissionId }, update: { attempts: 0, lockedAt: null, lockedBy: null } }),
    db.submission.update({ where: { id: submissionId }, data: { status: "QUEUED", failureMessage: null, completedAt: null } }),
  ]);
  revalidatePath("/admin/workers");
  revalidatePath(`/submissions/${submissionId}`);
}

export type ModerationAction = "private" | "public" | "hide" | "unhide" | "delete";

/**
 * Administrator moderation with a mandatory reason. Every action e-mails the
 * owner and the accepted collaborators, so nobody discovers a change by surprise.
 */
export async function adminModerateAction(id: string, action: ModerationAction, reason: string): Promise<{ ok: true; message: string } | { ok: false; error: string }> {
  const admin = await requireAdmin();
  const why = reason.trim();
  if (why.length < 10) return { ok: false, error: "Please give a reason (at least 10 characters) — it is sent to the author." };
  const sub = await db.submission.findUnique({
    where: { id },
    include: { user: { select: { email: true, name: true } }, collaborators: { where: { acceptedAt: { not: null } }, include: { user: { select: { email: true, name: true } } } } },
  });
  if (!sub) return { ok: false, error: "Submission not found." };
  if (action === "delete" && sub.status === "RUNNING") return { ok: false, error: "Cancel the running evaluation first, then delete." };
  if ((action === "private" || action === "public") && sub.contestId) return { ok: false, error: "Contest entries must stay public — hide it instead." };

  if (action === "delete") {
    await storage.remove(sub.fileKey);
    await db.submission.delete({ where: { id } });
  } else if (action === "private" || action === "public") {
    await db.submission.update({ where: { id }, data: { isPrivate: action === "private" } });
  } else {
    await db.submission.update({ where: { id }, data: { isHidden: action === "hide" } });
  }
  logEvent("admin.moderate", { id, seq: sub.seq, action, by: admin.id, reason: why });

  const recipients = [{ email: sub.user.email, name: sub.user.name }, ...sub.collaborators.map((c) => c.user)];
  let sent = 0;
  for (const r of recipients) if (await moderationEmail(r.email, r.name, sub.modelName, action === "delete" ? null : sub.id, action, why, admin.name ?? "an administrator")) sent++;

  revalidatePath("/leaderboard");
  revalidatePath("/submissions");
  revalidatePath(`/submissions/${id}`);
  revalidatePath("/admin/submissions");
  revalidatePath(`/users/${sub.userId}`);
  const verb = { private: "made private", public: "made public", hide: "hidden", unhide: "unhidden", delete: "deleted" }[action];
  return { ok: true, message: `Submission #${sub.seq} ${verb} — ${sent} of ${recipients.length} people notified` };
}

/** @deprecated kept for the HideToggle button; prefer adminModerateAction with a reason. */
export async function toggleHiddenAction(id: string, isHidden: boolean) {
  await requireAdmin();
  await db.submission.update({ where: { id }, data: { isHidden } });
  logEvent("admin.submission_hidden", { id, isHidden });
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
