"use server";

import { after } from "next/server";

import { accountEventEmail, accountDeletedEmail, roleChangedEmail, submissionDeletedEmail, bulkDeletionEmail } from "@/lib/mail";
import { logEvent } from "@/lib/log";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { contestSchema, zodErrors, type FieldErrors } from "@/lib/validation";
import { moderationEmail } from "@/lib/mail";
import { storage } from "@/lib/storage";
import { rescoreAll } from "@/lib/rescore";
import { ADMIN_NOTIFY_KINDS, recordAdminEvent } from "@/lib/admin-notify";
import { normalise, validateWeights, sameWeights, getActiveScoring, DEFAULT_WEIGHTS } from "@/lib/scoring-config";

// ---- bulk delete (admin table): one reason, many submissions; running evaluations are skipped

export async function adminBulkDeleteAction(ids: string[], reason: string, notifyAuthors: boolean): Promise<{ ok: true; deleted: number; skipped: string[]; emailed: number } | { ok: false; error: string }> {
  const admin = await requireAdmin();
  const why = reason.trim();
  if (why.length < 10) return { ok: false, error: "Give a reason (at least 10 characters) — it is kept in the activity log and sent to authors when notification is on." };
  const unique = [...new Set(ids)].slice(0, 100);
  if (!unique.length) return { ok: false, error: "Nothing selected." };
  const subs = await db.submission.findMany({
    where: { id: { in: unique } },
    include: { user: { select: { email: true, name: true } }, result: { select: { tracesKey: true } }, collaborators: { where: { acceptedAt: { not: null }, userId: { not: null } }, include: { user: { select: { email: true, name: true } } } } },
  });
  const skipped: string[] = [];
  const lines: string[] = [];
  let emailed = 0;
  for (const sub of subs) {
    if (sub.status === "RUNNING") {
      skipped.push(`#${sub.seq} ${sub.modelName} (running — cancel it first)`);
      continue;
    }
    await storage.remove(sub.fileKey).catch(() => {});
    if (sub.result?.tracesKey) await storage.remove(sub.result.tracesKey).catch(() => {});
    await db.submission.delete({ where: { id: sub.id } });
    lines.push(`#${sub.seq} "${sub.modelName}" — owner ${sub.user.name} <${sub.user.email}>`);
    logEvent("submission.deleted", { id: sub.id, seq: sub.seq, by: admin.id, bulk: true });
    if (notifyAuthors) {
      for (const rcpt of [{ email: sub.user.email, name: sub.user.name }, ...sub.collaborators.flatMap((c) => (c.user ? [c.user] : []))]) {
        if (await moderationEmail(rcpt.email, rcpt.name, sub.modelName, null, "delete", why, admin.name ?? "an administrator")) emailed++;
      }
    }
  }
  if (lines.length) {
    await recordAdminEvent("deletions", `${admin.name} bulk-deleted ${lines.length} submissions (${lines.map((l) => l.split(" ")[0]).join(", ")}) — reason: ${why}`);
    after(() => bulkDeletionEmail(admin.name ?? "an administrator", why, lines).catch(() => {}));
  }
  revalidatePath("/leaderboard");
  revalidatePath("/submissions");
  revalidatePath("/admin/submissions");
  return { ok: true, deleted: lines.length, skipped, emailed };
}

// ---- evaluation policy (Admin → Evaluation workers)

export async function saveEvalSettingsAction(input: { evalTimeoutMin: number; dryRunTimeoutMin: number; submissionsPerDay: number }): Promise<{ ok: true } | { ok: false; error: string }> {
  const admin = await requireAdmin();
  const evalTimeoutMin = Math.round(Number(input.evalTimeoutMin));
  const dryRunTimeoutMin = Math.round(Number(input.dryRunTimeoutMin));
  const submissionsPerDay = Math.round(Number(input.submissionsPerDay));
  if (!(evalTimeoutMin >= 10 && evalTimeoutMin <= 1440)) return { ok: false, error: "Evaluation limit must be 10–1440 minutes." };
  if (!(dryRunTimeoutMin >= 2 && dryRunTimeoutMin <= 60)) return { ok: false, error: "Test-run limit must be 2–60 minutes." };
  if (!(submissionsPerDay >= 1 && submissionsPerDay <= 100)) return { ok: false, error: "Daily submissions must be 1–100." };
  const data = { evalTimeoutMin, dryRunTimeoutMin, submissionsPerDay, updatedBy: admin.id };
  await db.evalSettings.upsert({ where: { id: 1 }, create: { id: 1, ...data }, update: data });
  await recordAdminEvent("settings", `${admin.name} set evaluation limits: ${evalTimeoutMin} min per evaluation, ${dryRunTimeoutMin} min per test run, ${submissionsPerDay} submissions/day per user`);
  logEvent("admin.eval_settings", { by: admin.id, evalTimeoutMin, dryRunTimeoutMin, submissionsPerDay });
  revalidatePath("/admin/workers");
  return { ok: true };
}

// ---- per-admin notification preferences (Admin → My notifications; each admin edits only their own)

export async function saveAdminNotifyAction(prefs: Record<string, boolean>): Promise<{ ok: true }> {
  const me = await requireAdmin();
  const clean = Object.fromEntries(ADMIN_NOTIFY_KINDS.map((k) => [k.key, prefs[k.key] !== false]));
  await db.user.update({ where: { id: me.id }, data: { adminNotify: clean } });
  logEvent("admin.notify_prefs", { by: me.id, ...clean });
  revalidatePath("/admin/notifications");
  return { ok: true };
}

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
  await recordAdminEvent("scoring", `Scoring weights ${weights ? "changed" : "reset to defaults"} by ${admin.name} — ${r.changed} submissions re-scored${r.emailed ? `, ${r.emailed} authors e-mailed` : ""}. Reason: ${why}`);
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
    include: { user: { select: { email: true, name: true, affiliation: true } }, result: { select: { weightedError: true, tracesKey: true } }, collaborators: { where: { acceptedAt: { not: null }, userId: { not: null } }, include: { user: { select: { email: true, name: true } } } } },
  });
  if (!sub) return { ok: false, error: "Submission not found." };
  if (action === "delete" && sub.status === "RUNNING") return { ok: false, error: "Cancel the running evaluation first, then delete." };
  if ((action === "private" || action === "public") && sub.contestId) return { ok: false, error: "Contest entries must stay public — hide it instead." };

  if (action === "delete") {
    await storage.remove(sub.fileKey);
    if (sub.result?.tracesKey) await storage.remove(sub.result.tracesKey).catch(() => {});
    await db.submission.delete({ where: { id } });
    after(() => submissionDeletedEmail({ ...sub, weightedError: sub.result?.weightedError ?? null, owner: sub.user }, { name: admin.name ?? "administrator", email: admin.email ?? "", role: "ADMIN" }, why).catch(() => {}));
  } else if (action === "private" || action === "public") {
    await db.submission.update({ where: { id }, data: { isPrivate: action === "private" } });
  } else {
    await db.submission.update({ where: { id }, data: { isHidden: action === "hide" } });
  }
  logEvent("admin.moderate", { id, seq: sub.seq, action, by: admin.id, reason: why });

  const recipients = [{ email: sub.user.email, name: sub.user.name }, ...sub.collaborators.flatMap((c) => (c.user ? [c.user] : []))];
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

// ---- authorship (admin): reassign the owner, or add/remove co-authors on someone else's submission

/**
 * Move a submission to a different owner. Used to correct authorship on entries created on
 * someone's behalf, or migrated from the previous platform. The former owner is kept as an
 * accepted co-author unless `keepFormerOwner` is false, so credit is never silently lost.
 * Nothing is e-mailed: this is a records correction, not a moderation action.
 */
export async function adminSetSubmissionOwnerAction(id: string, newOwnerId: string, keepFormerOwner = true): Promise<{ ok: true; message: string } | { ok: false; error: string }> {
  const admin = await requireAdmin();
  const sub = await db.submission.findUnique({ where: { id }, select: { id: true, seq: true, modelName: true, userId: true, user: { select: { name: true, email: true } } } });
  if (!sub) return { ok: false, error: "Submission not found." };
  if (sub.userId === newOwnerId) return { ok: false, error: "That person already owns this submission." };
  const next = await db.user.findUnique({ where: { id: newOwnerId }, select: { id: true, name: true, email: true } });
  if (!next) return { ok: false, error: "No account found for the chosen person." };

  await db.$transaction(async (tx) => {
    // the incoming owner must not also sit in the collaborator list
    await tx.submissionCollaborator.deleteMany({ where: { submissionId: id, userId: next.id } });
    await tx.submission.update({ where: { id }, data: { userId: next.id } });
    if (keepFormerOwner) {
      await tx.submissionCollaborator.upsert({
        where: { submissionId_userId: { submissionId: id, userId: sub.userId } },
        create: { submissionId: id, userId: sub.userId, acceptedAt: new Date(), notifiedAt: new Date() },
        update: { acceptedAt: new Date(), notifiedAt: new Date() },
      });
    }
  });

  logEvent("admin.submission_owner_changed", { id, seq: sub.seq, by: admin.id, from: sub.userId, to: next.id, keepFormerOwner });
  await recordAdminEvent("deletions", `${admin.name} reassigned submission #${sub.seq} "${sub.modelName}" from ${sub.user.name} <${sub.user.email}> to ${next.name} <${next.email}>${keepFormerOwner ? " (former owner kept as co-author)" : ""}`);
  revalidatePath("/leaderboard");
  revalidatePath(`/submissions/${id}`);
  revalidatePath("/submissions");
  revalidatePath("/admin/submissions");
  return { ok: true, message: `#${sub.seq} now owned by ${next.name}` };
}

/** Add a co-author to any submission (admins only; listed as accepted, no invitation e-mail). */
export async function adminAddCoAuthorAction(id: string, userId: string): Promise<{ ok: true; message: string } | { ok: false; error: string }> {
  const admin = await requireAdmin();
  const sub = await db.submission.findUnique({ where: { id }, select: { seq: true, userId: true, modelName: true } });
  if (!sub) return { ok: false, error: "Submission not found." };
  if (sub.userId === userId) return { ok: false, error: "That person is the owner." };
  const user = await db.user.findUnique({ where: { id: userId }, select: { id: true, name: true, email: true } });
  if (!user) return { ok: false, error: "No account found for the chosen person." };
  if ((await db.submissionCollaborator.count({ where: { submissionId: id } })) >= 10) return { ok: false, error: "A submission can have at most 10 co-authors." };
  await db.submissionCollaborator.upsert({
    where: { submissionId_userId: { submissionId: id, userId: user.id } },
    create: { submissionId: id, userId: user.id, acceptedAt: new Date(), notifiedAt: new Date() },
    update: { acceptedAt: new Date(), notifiedAt: new Date() },
  });
  logEvent("admin.coauthor_added", { id, seq: sub.seq, by: admin.id, userId: user.id });
  await recordAdminEvent("deletions", `${admin.name} added ${user.name} <${user.email}> as a co-author of #${sub.seq} "${sub.modelName}"`);
  revalidatePath("/leaderboard");
  revalidatePath(`/submissions/${id}`);
  revalidatePath("/admin/submissions");
  return { ok: true, message: `${user.name} added as co-author` };
}

/**
 * Credit someone who has no account on the platform — administrators only. Stored as a
 * collaborator row with no userId, so the person is listed everywhere co-authors appear but
 * receives no e-mail and has no profile page. If they later register, replace the credit with
 * a normal co-author.
 */
export async function adminAddCreditAction(id: string, name: string, affiliation: string): Promise<{ ok: true; message: string } | { ok: false; error: string }> {
  const admin = await requireAdmin();
  const who = name.trim();
  const where = affiliation.trim();
  if (who.length < 2) return { ok: false, error: "Enter the person's full name." };
  if (who.length > 120 || where.length > 160) return { ok: false, error: "Name or affiliation is too long." };
  const sub = await db.submission.findUnique({ where: { id }, select: { seq: true, modelName: true } });
  if (!sub) return { ok: false, error: "Submission not found." };
  if ((await db.submissionCollaborator.count({ where: { submissionId: id } })) >= 10) return { ok: false, error: "A submission can have at most 10 co-authors." };
  const clash = await db.submissionCollaborator.findFirst({ where: { submissionId: id, userId: null, name: who } });
  if (clash) return { ok: false, error: `${who} is already credited on this submission.` };
  await db.submissionCollaborator.create({ data: { submissionId: id, name: who, affiliation: where || null, acceptedAt: new Date(), notifiedAt: new Date() } });
  logEvent("admin.credit_added", { id, seq: sub.seq, by: admin.id, name: who });
  await recordAdminEvent("deletions", `${admin.name} credited ${who}${where ? ` (${where})` : ""} — who has no account — on #${sub.seq} "${sub.modelName}"`);
  revalidatePath("/leaderboard");
  revalidatePath(`/submissions/${id}`);
  revalidatePath("/admin/submissions");
  return { ok: true, message: `${who} credited` };
}

/** Remove an unregistered credit (matched by name, since there is no account to key on). */
export async function adminRemoveCreditAction(id: string, name: string): Promise<{ ok: true; message: string } | { ok: false; error: string }> {
  const admin = await requireAdmin();
  const sub = await db.submission.findUnique({ where: { id }, select: { seq: true, modelName: true } });
  if (!sub) return { ok: false, error: "Submission not found." };
  const { count } = await db.submissionCollaborator.deleteMany({ where: { submissionId: id, userId: null, name } });
  if (!count) return { ok: false, error: "That credit is no longer listed." };
  logEvent("admin.credit_removed", { id, seq: sub.seq, by: admin.id, name });
  await recordAdminEvent("deletions", `${admin.name} removed the credit for ${name} on #${sub.seq} "${sub.modelName}"`);
  revalidatePath("/leaderboard");
  revalidatePath(`/submissions/${id}`);
  revalidatePath("/admin/submissions");
  return { ok: true, message: `${name} removed` };
}

/** Remove a co-author from any submission (admins only). The owner cannot be removed this way. */
export async function adminRemoveCoAuthorAction(id: string, userId: string): Promise<{ ok: true; message: string } | { ok: false; error: string }> {
  const admin = await requireAdmin();
  const sub = await db.submission.findUnique({ where: { id }, select: { seq: true, userId: true, modelName: true } });
  if (!sub) return { ok: false, error: "Submission not found." };
  if (sub.userId === userId) return { ok: false, error: "That is the owner — reassign the submission instead." };
  const user = await db.user.findUnique({ where: { id: userId }, select: { name: true, email: true } });
  await db.submissionCollaborator.deleteMany({ where: { submissionId: id, userId } });
  logEvent("admin.coauthor_removed", { id, seq: sub.seq, by: admin.id, userId });
  if (user) await recordAdminEvent("deletions", `${admin.name} removed ${user.name} <${user.email}> as a co-author of #${sub.seq} "${sub.modelName}"`);
  revalidatePath("/leaderboard");
  revalidatePath(`/submissions/${id}`);
  revalidatePath("/admin/submissions");
  return { ok: true, message: `${user?.name ?? "Co-author"} removed` };
}

export async function setRoleAction(userId: string, role: "USER" | "ADMIN") {
  const me = await requireAdmin();
  if (me.id === userId) throw new Error("You cannot change your own role");
  const before = await db.user.findUnique({ where: { id: userId }, select: { role: true } });
  const user = await db.user.update({ where: { id: userId }, data: { role } });
  if (before && before.role !== role) {
    logEvent("admin.role_changed", { by: me.id, userId, role });
    after(() => roleChangedEmail(user, role, me.name).catch(() => {}));
  }
  revalidatePath("/admin/users");
}

/**
 * Delete an account and everything it owns. Safety rails: no self-delete, no deleting an
 * administrator (revoke admin first — prevents a single compromised admin wiping the others),
 * and nothing with a RUNNING evaluation (cancel it first). Storage objects (queued packages,
 * trace files) are removed; the DB rows cascade with the user.
 */
export async function adminDeleteUserAction(userId: string, reason: string, notifyUser: boolean): Promise<{ ok: true; message: string } | { ok: false; error: string }> {
  const admin = await requireAdmin();
  const why = reason.trim();
  if (why.length < 10) return { ok: false, error: "Give a reason (at least 10 characters) — it is kept in the activity log." };
  if (userId === admin.id) return { ok: false, error: "You cannot delete your own account from here." };
  const user = await db.user.findUnique({ where: { id: userId }, include: { submissions: { select: { seq: true, status: true, fileKey: true, result: { select: { tracesKey: true } } } } } });
  if (!user) return { ok: false, error: "User not found." };
  if (user.role === "ADMIN") return { ok: false, error: "This account is an administrator — revoke admin access first, then delete." };
  const running = user.submissions.filter((s) => s.status === "RUNNING");
  if (running.length) return { ok: false, error: `Submission #${running[0].seq} is being evaluated — cancel it first.` };
  for (const s of user.submissions) {
    await storage.remove(s.fileKey).catch(() => {});
    if (s.result?.tracesKey) await storage.remove(s.result.tracesKey).catch(() => {});
  }
  await db.user.delete({ where: { id: userId } }); // submissions, results, dry runs, collaborations, tokens cascade
  logEvent("admin.user_deleted", { by: admin.id, userId, email: user.email, submissions: user.submissions.length, reason: why });
  after(() => accountDeletedEmail({ name: user.name, email: user.email }, why, admin.name ?? "an administrator", { submissions: user.submissions.length }, notifyUser).catch(() => {}));
  revalidatePath("/admin/users");
  revalidatePath("/leaderboard");
  return { ok: true, message: `${user.name} deleted — ${user.submissions.length} submissions removed${notifyUser ? "; the person was e-mailed" : ""}` };
}

export async function verifyUserAction(userId: string) {
  const admin = await requireAdmin();
  const verified = await db.user.update({ where: { id: userId }, data: { emailVerified: new Date() } });
  after(() => accountEventEmail("verified", verified, `administrator ${admin.name}`).catch(() => {}));
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
