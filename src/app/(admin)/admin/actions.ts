"use server";

import { accountEventEmail, roleChangedEmail, submissionDeletedEmail } from "@/lib/mail";
import { logEvent } from "@/lib/log";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { contestSchema, zodErrors, type FieldErrors } from "@/lib/validation";
import { moderationEmail } from "@/lib/mail";
import { storage } from "@/lib/storage";
import { rescoreAll } from "@/lib/rescore";
import { normalise, validateWeights, sameWeights, getActiveScoring, DEFAULT_WEIGHTS } from "@/lib/scoring-config";

// ---- scoring weights

/** Dry run: how many stored scores would change with these weights. */
export async function previewScoringAction(weights: Record<string, number>): Promise<{ ok: true; changed: number; checked: number; sample: { seq: number; modelName: string; from: number; to: number }[] } | { ok: false; error: string }> {
  await requireAdmin();
  const w = normalise(weights);
  const problem = validateWeights(w);
  if (problem) return { ok: false, error: problem };
  const r = await rescoreAll({ apply: false, notify: false, note: "", by: "preview", weights: w });
  return { ok: true, changed: r.changed, checked: r.checked, sample: r.changes.slice(0, 50) };
}

/** Save new weights (or null = reset to defaults), re-score everything, optionally e-mail authors. */
export async function saveScoringAction(weights: Record<string, number> | null, note: string, notify: boolean): Promise<{ ok: true; rescored: number; emailed: number } | { ok: false; error: string }> {
  const admin = await requireAdmin();
  const why = note.trim();
  if (why.length < 10) return { ok: false, error: "Give a reason (at least 10 characters) — it is sent to authors and kept in the change log." };
  const w = weights ? normalise(weights) : DEFAULT_WEIGHTS;
  const problem = validateWeights(w);
  if (problem) return { ok: false, error: problem };
  const current = await getActiveScoring(true);
  if (sameWeights(w, current.weights)) return { ok: false, error: "These are already the active weights." };
  const cfg = await db.scoringConfig.create({ data: { createdBy: admin.id, note: why, weights: w } });
  const r = await rescoreAll({ apply: true, notify, note: why, by: admin.id, weights: w });
  await db.scoringConfig.update({ where: { id: cfg.id }, data: { rescored: r.changed, notified: r.emailed } });
  logEvent("admin.scoring_changed", { by: admin.id, reset: !weights, rescored: r.changed, emailed: r.emailed, note: why });
  revalidatePath("/leaderboard");
  revalidatePath("/docs");
  revalidatePath("/admin/scoring");
  return { ok: true, rescored: r.changed, emailed: r.emailed };
}

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
    include: { user: { select: { email: true, name: true, affiliation: true } }, result: { select: { weightedError: true } }, collaborators: { where: { acceptedAt: { not: null } }, include: { user: { select: { email: true, name: true } } } } },
  });
  if (!sub) return { ok: false, error: "Submission not found." };
  if (action === "delete" && sub.status === "RUNNING") return { ok: false, error: "Cancel the running evaluation first, then delete." };
  if ((action === "private" || action === "public") && sub.contestId) return { ok: false, error: "Contest entries must stay public — hide it instead." };

  if (action === "delete") {
    await storage.remove(sub.fileKey);
    await db.submission.delete({ where: { id } });
    submissionDeletedEmail({ ...sub, weightedError: sub.result?.weightedError ?? null, owner: sub.user }, { name: admin.name ?? "administrator", email: admin.email ?? "", role: "ADMIN" }, why).catch(() => {});
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
  const before = await db.user.findUnique({ where: { id: userId }, select: { role: true } });
  const user = await db.user.update({ where: { id: userId }, data: { role } });
  if (before && before.role !== role) {
    logEvent("admin.role_changed", { by: me.id, userId, role });
    roleChangedEmail(user, role, me.name).catch(() => {});
  }
  revalidatePath("/admin/users");
}

export async function verifyUserAction(userId: string) {
  const admin = await requireAdmin();
  const verified = await db.user.update({ where: { id: userId }, data: { emailVerified: new Date() } });
  accountEventEmail("verified", verified, `administrator ${admin.name}`).catch(() => {});
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
