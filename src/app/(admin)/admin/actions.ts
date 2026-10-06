"use server";

import { after } from "next/server";

import { accountEventEmail, accountDeletedEmail, roleChangedEmail, submissionDeletedEmail, bulkDeletionEmail } from "@/lib/mail";
import { logEvent } from "@/lib/log";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { contestSchema, zodErrors, type FieldErrors } from "@/lib/validation";
import { Prisma } from "@prisma/client";
import { contestPhase, parseZonedInput, prizeTextOf, prizesOf, standings, type Winner } from "@/lib/contest";
import { getLeaderboardRows } from "@/lib/queries";
import { moderationEmail, bulkModerationEmail, contestResultsEmail } from "@/lib/mail";
import { storage } from "@/lib/storage";
import { rescoreAll } from "@/lib/rescore";
import { ADMIN_NOTIFY_KINDS, recordAdminEvent } from "@/lib/admin-notify";
import { normalise, validateWeights, sameWeights, getActiveScoring, DEFAULT_WEIGHTS } from "@/lib/scoring-config";

// ---- bulk delete (admin table): one reason, many submissions; running evaluations are skipped

export async function adminBulkDeleteAction(ids: string[], reason: string, notifyAuthors: boolean): Promise<{ ok: true; deleted: number; skipped: string[]; emailed: number } | { ok: false; error: string }> {
  const admin = await requireAdmin();
  const why = reason.trim();
  if (why.length < 10) return { ok: false, error: "Give a reason (at least 10 characters). It is kept in the activity log and sent to authors when notification is on." };
  const unique = [...new Set(ids)].slice(0, 100);
  if (!unique.length) return { ok: false, error: "Nothing selected." };
  const subs = await db.submission.findMany({
    where: { id: { in: unique } },
    include: { user: { select: { email: true, name: true } }, result: { select: { tracesKey: true } }, collaborators: { where: { acceptedAt: { not: null }, userId: { not: null } }, include: { user: { select: { email: true, name: true } } } } },
  });
  const skipped: string[] = [];
  const lines: string[] = [];
  const perRecipient = new Map<string, { name: string; models: string[] }>();
  let emailed = 0;
  for (const sub of subs) {
    if (sub.status === "RUNNING") {
      skipped.push(`#${sub.seq} ${sub.modelName} (running, cancel it first)`);
      continue;
    }
    if (sub.fileKey) await storage.remove(sub.fileKey).catch(() => {});
    if (sub.result?.tracesKey) await storage.remove(sub.result.tracesKey).catch(() => {});
    await db.submission.delete({ where: { id: sub.id } });
    lines.push(`#${sub.seq} "${sub.modelName}", owner ${sub.user.name} <${sub.user.email}>`);
    logEvent("submission.deleted", { id: sub.id, seq: sub.seq, by: admin.id, bulk: true });
    if (notifyAuthors) {
      // gather per person; one e-mail each at the end, however many of their submissions went
      for (const rcpt of [{ email: sub.user.email, name: sub.user.name }, ...sub.collaborators.flatMap((c) => (c.user ? [c.user] : []))]) {
        const entry = perRecipient.get(rcpt.email) ?? { name: rcpt.name, models: [] };
        entry.models.push(`#${sub.seq} ${sub.modelName}`);
        perRecipient.set(rcpt.email, entry);
      }
    }
  }
  for (const [email, { name, models }] of perRecipient) {
    if (await bulkModerationEmail(email, name, models, why, admin.name ?? "an administrator")) emailed++;
  }
  if (lines.length) {
    await recordAdminEvent("deletions", `${admin.name} bulk-deleted ${lines.length} submissions (${lines.map((l) => l.split(" ")[0]).join(", ")}); reason: ${why}`);
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
  if (why.length < 10) return { ok: false, error: "Give a reason (at least 10 characters). It is sent to authors and kept in the change log." };
  const w = weights ? normalise(weights) : DEFAULT_WEIGHTS;
  const problem = validateWeights(w);
  if (problem) return { ok: false, error: problem };
  const current = await getActiveScoring(true);
  if (sameWeights(w, current.weights)) return { ok: false, error: "These are already the active weights." };
  const cfg = await db.scoringConfig.create({ data: { createdBy: admin.id, note: why, weights: w } });
  const r = await rescoreAll({ apply: true, notify, note: why, by: admin.id, weights: w });
  await db.scoringConfig.update({ where: { id: cfg.id }, data: { rescored: r.changed, notified: r.emailed } });
  logEvent("admin.scoring_changed", { by: admin.id, reset: !weights, rescored: r.changed, emailed: r.emailed, note: why });
  await recordAdminEvent("scoring", `Scoring weights ${weights ? "changed" : "reset to defaults"} by ${admin.name}: ${r.changed} submissions re-scored${r.emailed ? `, ${r.emailed} authors e-mailed` : ""}. Reason: ${why}`);
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
  if (why.length < 10) return { ok: false, error: "Please give a reason (at least 10 characters). It is sent to the author." };
  const sub = await db.submission.findUnique({
    where: { id },
    include: { user: { select: { email: true, name: true, affiliation: true } }, result: { select: { weightedError: true, tracesKey: true } }, collaborators: { where: { acceptedAt: { not: null }, userId: { not: null } }, include: { user: { select: { email: true, name: true } } } } },
  });
  if (!sub) return { ok: false, error: "Submission not found." };
  if (action === "delete" && sub.status === "RUNNING") return { ok: false, error: "Cancel the running evaluation first, then delete." };
  if ((action === "private" || action === "public") && sub.contestId) return { ok: false, error: "Contest entries must stay public; hide it instead." };

  if (action === "delete") {
    if (sub.fileKey) await storage.remove(sub.fileKey);
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
  return { ok: true, message: `Submission #${sub.seq} ${verb}; ${sent} of ${recipients.length} people notified` };
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
  if (why.length < 10) return { ok: false, error: "Give a reason (at least 10 characters). It is kept in the activity log." };
  if (userId === admin.id) return { ok: false, error: "You cannot delete your own account from here." };
  const user = await db.user.findUnique({ where: { id: userId }, include: { submissions: { select: { seq: true, status: true, fileKey: true, result: { select: { tracesKey: true } } } } } });
  if (!user) return { ok: false, error: "User not found." };
  if (user.role === "ADMIN") return { ok: false, error: "This account is an administrator; revoke admin access first, then delete." };
  const running = user.submissions.filter((s) => s.status === "RUNNING");
  if (running.length) return { ok: false, error: `Submission #${running[0].seq} is being evaluated; cancel it first.` };
  for (const s of user.submissions) {
    if (s.fileKey) await storage.remove(s.fileKey).catch(() => {});
    if (s.result?.tracesKey) await storage.remove(s.result.tracesKey).catch(() => {});
  }
  await db.user.delete({ where: { id: userId } }); // submissions, results, dry runs, collaborations, tokens cascade
  logEvent("admin.user_deleted", { by: admin.id, userId, email: user.email, submissions: user.submissions.length, reason: why });
  after(() => accountDeletedEmail({ name: user.name, email: user.email }, why, admin.name ?? "an administrator", { submissions: user.submissions.length }, notifyUser).catch(() => {}));
  revalidatePath("/admin/users");
  revalidatePath("/leaderboard");
  return { ok: true, message: `${user.name} deleted; ${user.submissions.length} submissions removed${notifyUser ? ", the person was e-mailed" : ""}` };
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

const CONTEST_TEXT_KEYS = ["title", "slug", "summary", "description", "rules", "startsAt", "endsAt", "registrationEndsAt", "maxSubmissionsPerUser", "maxTeamSize", "eligibility", "eligibilityNote"] as const;

/**
 * Create or edit a contest. `intent` decides publication: "draft" hides it, "publish" makes it public
 * (its phase then follows the dates), "save" keeps whatever it is. Dates are typed in site time.
 */
export async function saveContestAction(_prev: ContestFormState, fd: FormData): Promise<ContestFormState> {
  const admin = await requireAdmin();
  const id = String(fd.get("id") ?? "");
  const intent = String(fd.get("intent") ?? "save");
  const labels = fd.getAll("prizeLabel").map(String), amounts = fd.getAll("prizeAmount").map(String);
  const prizes = labels.map((label, i) => ({ label, amount: amounts[i] ?? "" })).filter((p) => p.label.trim() || p.amount.trim());
  const allowedRuntimes = fd.getAll("allowedRuntimes").map(String);
  const values: Record<string, string> = Object.fromEntries(CONTEST_TEXT_KEYS.map((k) => [k, String(fd.get(k) ?? "")]));
  values.prizes = JSON.stringify(prizes);
  values.allowedRuntimes = allowedRuntimes.join(",");

  const parsed = contestSchema.safeParse({
    ...values,
    startsAt: parseZonedInput(values.startsAt),
    endsAt: parseZonedInput(values.endsAt),
    registrationEndsAt: values.registrationEndsAt ? parseZonedInput(values.registrationEndsAt) : null,
    allowedRuntimes,
    prizes,
  });
  if (!parsed.success) return { errors: zodErrors(parsed.error), values };
  const d = parsed.data;
  const clash = await db.contest.findUnique({ where: { slug: d.slug } });
  if (clash && clash.id !== id) return { errors: { slug: "Another contest already uses this slug" }, values };

  const existing = id ? await db.contest.findUnique({ where: { id }, select: { status: true } }) : null;
  if (id && !existing) return { errors: { form: "This contest no longer exists." }, values };
  const status = intent === "publish" ? "OPEN" : intent === "draft" ? "DRAFT" : (existing?.status ?? "DRAFT");

  // One running contest at a time keeps "the current contest" (homepage, submit form) unambiguous.
  if (status === "OPEN" || status === "CLOSED") {
    const overlap = await db.contest.findFirst({
      where: { ...(id ? { id: { not: id } } : {}), status: { in: ["OPEN", "CLOSED"] }, startsAt: { lt: d.endsAt }, endsAt: { gt: d.startsAt } },
      select: { title: true },
    });
    if (overlap) return { errors: { form: `These dates overlap "${overlap.title}", which is already published. Move the dates, or unpublish that contest first.` }, values };
  }

  const data = { ...d, prizeText: prizeTextOf(d.prizes), status };
  const contest = id ? await db.contest.update({ where: { id }, data }) : await db.contest.create({ data });
  if (!existing || existing.status !== status) {
    const verb = status === "DRAFT" ? (existing ? "unpublished" : "drafted") : existing ? "published" : "created and published";
    await recordAdminEvent("contests", `${admin.name} ${verb} contest "${contest.title}"`);
  }
  revalidatePath("/contest");
  revalidatePath(`/contest/${contest.slug}`);
  revalidatePath("/admin/contests");
  revalidatePath("/");
  redirect(`/admin/contests/${contest.id}?saved=${status === "DRAFT" ? "draft" : "published"}`);
}

/** Copy a contest's settings and text into a new draft (dates kept; winners and registrations are not copied). */
export async function duplicateContestAction(id: string) {
  const admin = await requireAdmin();
  const c = await db.contest.findUnique({ where: { id } });
  if (!c) return;
  let slug = `${c.slug}-copy`.slice(0, 60);
  for (let n = 2; await db.contest.findUnique({ where: { slug }, select: { id: true } }); n++) slug = `${c.slug.slice(0, 52)}-copy-${n}`;
  const copy = await db.contest.create({
    data: {
      slug, title: `Copy of ${c.title}`.slice(0, 100), summary: c.summary, description: c.description, rules: c.rules,
      prizeText: c.prizeText, prizes: c.prizes ?? undefined, startsAt: c.startsAt, endsAt: c.endsAt, registrationEndsAt: c.registrationEndsAt,
      maxSubmissionsPerUser: c.maxSubmissionsPerUser, maxTeamSize: c.maxTeamSize, eligibility: c.eligibility, eligibilityNote: c.eligibilityNote,
      allowedRuntimes: c.allowedRuntimes, status: "DRAFT",
    },
  });
  await recordAdminEvent("contests", `${admin.name} duplicated contest "${c.title}" as a draft`);
  revalidatePath("/admin/contests");
  redirect(`/admin/contests/${copy.id}`);
}

/**
 * Record the winners once the deadline has passed. `picks` is one submission id per prize place (in
 * order); the standings snapshot (model, author, score) is stored with each so the result does not
 * shift if a submission is later renamed or rescored.
 */
export async function finalizeContestAction(id: string, picks: string[], resultsNote: string, notify: boolean): Promise<{ ok: true; emailed: number } | { ok: false; error: string }> {
  const admin = await requireAdmin();
  const c = await db.contest.findUnique({ where: { id }, include: { entries: { include: { user: { select: { name: true, email: true } } } } } });
  if (!c) return { ok: false, error: "This contest no longer exists." };
  const phase = contestPhase(c);
  if (phase !== "judging" && phase !== "judged") return { ok: false, error: "Results can be finalized only after the deadline." };
  const prizes = prizesOf(c);
  const places = Math.max(prizes.length, 1);
  if (picks.length !== places || picks.some((p) => !p)) return { ok: false, error: `Choose an entry for each of the ${places} place${places === 1 ? "" : "s"}.` };
  if (new Set(picks).size !== picks.length) return { ok: false, error: "The same entry is picked for two places." };

  const ranked = standings(await getLeaderboardRows({ contestId: c.id, isAdmin: true }), c.endsAt);
  const byId = new Map(ranked.map((r) => [r.id, r]));
  const winners: Winner[] = [];
  for (const [i, sid] of picks.entries()) {
    const r = byId.get(sid);
    if (!r) return { ok: false, error: "One of the picked entries is not a scored, on-time entry of this contest." };
    winners.push({ place: i + 1, label: prizes[i]?.label ?? "Winner", amount: prizes[i]?.amount ?? "", submissionId: r.id, userId: r.userId, modelName: r.modelName, author: r.author, weightedError: r.weightedError });
  }
  const wasJudged = c.status === "JUDGED";
  await db.contest.update({ where: { id }, data: { winners, status: "JUDGED", judgedAt: new Date(), resultsNote: resultsNote.trim() || null } });
  await recordAdminEvent("contests", `${admin.name} ${wasJudged ? "updated" : "finalized"} the results of "${c.title}" (1st: ${winners[0].modelName} by ${winners[0].author})`);

  let emailed = 0;
  if (notify) {
    for (const e of c.entries) if (await contestResultsEmail(e.user.email, e.user.name, c, winners, e.userId)) emailed++;
  }
  revalidatePath(`/contest/${c.slug}`);
  revalidatePath("/contest");
  revalidatePath(`/admin/contests/${id}`);
  return { ok: true, emailed };
}

/** Undo finalization (e.g. after a disqualification): back to judging, winners cleared. */
export async function reopenContestResultsAction(id: string) {
  const admin = await requireAdmin();
  const c = await db.contest.update({ where: { id }, data: { status: "OPEN", winners: Prisma.DbNull, judgedAt: null } });
  await recordAdminEvent("contests", `${admin.name} reopened judging for "${c.title}"`);
  revalidatePath(`/contest/${c.slug}`);
  revalidatePath(`/admin/contests/${id}/results`);
}

export async function deleteContestAction(id: string) {
  await requireAdmin();
  await db.contest.delete({ where: { id } });
  revalidatePath("/contest");
  redirect("/admin/contests");
}
