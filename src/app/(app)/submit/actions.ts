"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
import { storage, MAX_UPLOAD_BYTES, OBJECT_KEY_RE } from "@/lib/storage";
import { checkSubmissionPackage } from "@/lib/package-check";
import { submissionMetaSchema, zodErrors, type FieldErrors } from "@/lib/validation";
import { collaboratorInviteEmail, collaboratorAcceptedEmail, collaboratorDeclinedEmail } from "@/lib/mail";
import { randomBytes } from "crypto";

export interface SubmitState {
  errors?: FieldErrors;
  values?: Record<string, string>;
}

export async function createSubmissionAction(_prev: SubmitState, fd: FormData): Promise<SubmitState> {
  const session = await auth();
  if (!session?.user) redirect("/login?next=/submit");

  const raw = {
    modelName: String(fd.get("modelName") ?? ""),
    description: String(fd.get("description") ?? ""),
    modelType: String(fd.get("modelType") ?? ""),
    evaluationLevel: String(fd.get("evaluationLevel") ?? "DYNAMIC"),
    isPrivate: fd.get("isPrivate") === "on",
    contestId: (fd.get("contestId") as string) || null,
    acceptTerms: fd.get("acceptTerms") === "on",
  };
  const values = { modelName: raw.modelName, description: raw.description, modelType: raw.modelType, evaluationLevel: raw.evaluationLevel, contestId: raw.contestId ?? "" };
  const parsed = submissionMetaSchema.safeParse(raw);
  if (!parsed.success) return { errors: zodErrors(parsed.error), values };

  // The package arrives either as a multipart file (STORAGE=local) or as the
  // object key of a file the browser uploaded directly (STORAGE=supabase).
  let bytes: Buffer;
  let fileName: string;
  let fileSize: number;
  let preUploadedKey: string | null = null;
  const uploadedKey = String(fd.get("fileKey") ?? "");
  if (storage.mode === "supabase" && uploadedKey) {
    if (!OBJECT_KEY_RE.test(uploadedKey)) return { errors: { file: "Invalid upload reference" }, values };
    fileName = String(fd.get("fileName") ?? "model.zip");
    try {
      bytes = await storage.getBytes(uploadedKey);
    } catch {
      return { errors: { file: "The uploaded package could not be retrieved. Please try again." }, values };
    }
    fileSize = bytes.length;
    preUploadedKey = uploadedKey;
  } else {
    const file = fd.get("file");
    if (!(file instanceof File) || file.size === 0) return { errors: { file: "Upload your submission package (.zip containing Model.m, Model.p or Model.py)" }, values };
    fileName = file.name;
    fileSize = file.size;
    bytes = Buffer.from(await file.arrayBuffer());
  }
  const ext = fileName.split(".").pop()?.toLowerCase();
  const reject = async (msg: string): Promise<SubmitState> => {
    if (preUploadedKey) await storage.remove(preUploadedKey);
    return { errors: { file: msg }, values };
  };
  if (ext !== "zip") return reject("Only .zip submission packages are accepted — see the submission format guide.");
  if (fileSize > MAX_UPLOAD_BYTES) return reject(`File exceeds the ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)} MB limit`);
  const check = checkSubmissionPackage(bytes);
  if (!check.ok) return reject(check.problems.join(" "));

  // Collaborators chosen on the form (must be existing accounts, not the owner, ≤ 10)
  let collaborators: { id: string; email: string; name: string }[] = [];
  try {
    const ids = JSON.parse(String(fd.get("collaboratorIds") || "[]")) as unknown;
    if (Array.isArray(ids) && ids.length) {
      const unique = [...new Set(ids.filter((x): x is string => typeof x === "string"))].filter((x) => x !== session.user.id).slice(0, 10);
      collaborators = await db.user.findMany({ where: { id: { in: unique }, emailVerified: { not: null } }, select: { id: true, email: true, name: true } });
    }
  } catch {
    return reject("Collaborator list could not be read.");
  }

  // Contest checks
  let contestId: string | null = null;
  if (parsed.data.contestId) {
    const contest = await db.contest.findUnique({ where: { id: parsed.data.contestId }, include: { entries: { where: { userId: session.user.id } } } });
    const now = new Date();
    if (!contest || contest.status !== "OPEN" || contest.startsAt > now || contest.endsAt < now) {
      if (preUploadedKey) await storage.remove(preUploadedKey);
      return { errors: { contestId: "This contest is not accepting submissions" }, values };
    }
    if (contest.entries.length === 0) {
      if (preUploadedKey) await storage.remove(preUploadedKey);
      return { errors: { contestId: "Register for the contest before submitting to it" }, values };
    }
    const count = await db.submission.count({ where: { contestId: contest.id, userId: session.user.id, status: { not: "FAILED" } } });
    if (count >= contest.maxSubmissionsPerUser) {
      if (preUploadedKey) await storage.remove(preUploadedKey);
      return { errors: { contestId: `You have reached the limit of ${contest.maxSubmissionsPerUser} contest submissions` }, values };
    }
    contestId = contest.id;
  }

  const key = preUploadedKey ?? (await storage.put(bytes, "zip"));
  const sub = await db.submission.create({
    data: {
      userId: session.user.id,
      modelName: parsed.data.modelName,
      description: parsed.data.description,
      modelType: parsed.data.modelType,
      evaluationLevel: parsed.data.evaluationLevel,
      isPrivate: parsed.data.isPrivate,
      fileKey: key,
      fileName,
      fileType: "ZIP",
      fileSize,
      contestId,
      job: { create: {} },
      collaborators: { create: collaborators.map((c) => ({ userId: c.id })) },
    },
  });
  // Collaborators start as pending; the owner confirms the e-mails on the submission page.
  revalidatePath("/submissions");
  redirect(`/submissions/${sub.id}?new=1`);
}

async function ownedSubmission(id: string) {
  const session = await auth();
  if (!session?.user) throw new Error("Not signed in");
  const sub = await db.submission.findUnique({ where: { id } });
  if (!sub) throw new Error("Submission not found");
  if (sub.userId !== session.user.id && session.user.role !== "ADMIN") throw new Error("Forbidden");
  return { sub, session };
}

export async function togglePrivateAction(id: string, isPrivate: boolean) {
  const { sub } = await ownedSubmission(id);
  if (sub.contestId && !isPrivate === false) {
    // contest entries must stay public for the frozen contest leaderboard
  }
  await db.submission.update({ where: { id }, data: { isPrivate } });
  revalidatePath("/leaderboard");
  revalidatePath("/submissions");
  revalidatePath(`/submissions/${id}`);
}

export async function deleteSubmissionAction(id: string) {
  const { sub } = await ownedSubmission(id);
  if (sub.status === "RUNNING") throw new Error("Cannot delete a submission while it is being evaluated");
  await storage.remove(sub.fileKey);
  await db.submission.delete({ where: { id } });
  revalidatePath("/leaderboard");
  revalidatePath("/submissions");
  redirect("/submissions");
}

/** Add a co-author by user id (from the picker) or account email. Only the owner (or an admin) may edit collaborators. */
export async function addCollaboratorAction(id: string, userIdOrEmail: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const { sub, session } = await ownedSubmission(id);
  const key = userIdOrEmail.trim();
  if (!key) return { ok: false, error: "Choose a person to add." };
  const user = key.includes("@") ? await db.user.findUnique({ where: { email: key.toLowerCase() } }) : await db.user.findUnique({ where: { id: key } });
  if (!user) return { ok: false, error: "No account found. Collaborators must register first." };
  if (user.id === sub.userId) return { ok: false, error: "That is the submission owner." };
  const count = await db.submissionCollaborator.count({ where: { submissionId: id } });
  if (count >= 10) return { ok: false, error: "A submission can have at most 10 collaborators." };
  // Added as *pending*: no e-mail until the owner confirms with notifyCollaboratorsAction.
  // Admins may list people directly (e.g. historical entries) — those count as accepted.
  const adminBypass = session.user.role === "ADMIN" && session.user.id !== sub.userId;
  await db.submissionCollaborator.upsert({
    where: { submissionId_userId: { submissionId: id, userId: user.id } },
    create: { submissionId: id, userId: user.id, ...(adminBypass ? { acceptedAt: new Date(), notifiedAt: new Date() } : {}) },
    update: {},
  });
  revalidatePath("/leaderboard");
  revalidatePath(`/submissions/${id}`);
  revalidatePath("/submissions");
  return { ok: true };
}

/** Owner confirmation: e-mail every not-yet-notified collaborator (owner CC'd) and mark them notified. */
export async function notifyCollaboratorsAction(id: string): Promise<{ ok: true; sent: number } | { ok: false; error: string }> {
  const { sub, session } = await ownedSubmission(id);
  const pending = await db.submissionCollaborator.findMany({ where: { submissionId: id, notifiedAt: null }, include: { user: { select: { email: true, name: true } } } });
  if (!pending.length) return { ok: false, error: "Everyone has already been notified." };
  const owner = await db.user.findUnique({ where: { id: sub.userId }, select: { email: true } });
  let sent = 0;
  for (const c of pending) {
    const token = c.inviteToken ?? randomBytes(24).toString("base64url");
    const ok = await collaboratorInviteEmail(c.user.email, c.user.name, session.user.name, sub.modelName, sub.id, sub.status === "COMPLETED", token, owner?.email);
    if (ok) {
      sent++;
      await db.submissionCollaborator.update({ where: { submissionId_userId: { submissionId: id, userId: c.userId } }, data: { notifiedAt: new Date(), inviteToken: token } });
    }
  }
  revalidatePath(`/submissions/${id}`);
  return sent ? { ok: true, sent } : { ok: false, error: "E-mails could not be sent — check the mail settings." };
}

/** Accept or decline an invitation — by the signed-in collaborator, or via the e-mail token (no login needed). */
export async function respondToInviteAction(input: { submissionId: string } | { token: string }, accept: boolean): Promise<{ ok: true; modelName: string; submissionId: string } | { ok: false; error: string }> {
  const session = await auth();
  const row =
    "token" in input
      ? await db.submissionCollaborator.findUnique({ where: { inviteToken: input.token }, include: { user: true, submission: { include: { user: true } } } })
      : session?.user
        ? await db.submissionCollaborator.findUnique({ where: { submissionId_userId: { submissionId: input.submissionId, userId: session.user.id } }, include: { user: true, submission: { include: { user: true } } } })
        : null;
  if (!row) return { ok: false, error: "This invitation is no longer valid — it may have been withdrawn or already answered." };
  // Only the invited person may answer — the owner is CC'd on the e-mail and must not be able to accept on their behalf.
  if (!session?.user) return { ok: false, error: "Sign in as the invited person to respond." };
  if (session.user.id !== row.userId) return { ok: false, error: `This invitation is addressed to ${row.user.name}, not to your account.` };
  const { submission } = row;
  if (accept) {
    if (!row.acceptedAt) {
      await db.submissionCollaborator.update({ where: { submissionId_userId: { submissionId: row.submissionId, userId: row.userId } }, data: { acceptedAt: new Date(), inviteToken: null } });
      await collaboratorAcceptedEmail(submission.user.email, submission.user.name, row.user.name, submission.modelName, submission.id);
    }
  } else {
    await db.submissionCollaborator.delete({ where: { submissionId_userId: { submissionId: row.submissionId, userId: row.userId } } });
    await collaboratorDeclinedEmail(submission.user.email, submission.user.name, row.user.name, submission.modelName, submission.id);
  }
  revalidatePath("/leaderboard");
  revalidatePath("/submissions");
  revalidatePath(`/submissions/${submission.id}`);
  revalidatePath(`/users/${row.userId}`);
  return { ok: true, modelName: submission.modelName, submissionId: submission.id };
}

export async function removeCollaboratorAction(id: string, userId: string) {
  const session = await auth();
  if (!session?.user) throw new Error("Not signed in");
  const sub = await db.submission.findUnique({ where: { id }, select: { userId: true } });
  if (!sub) throw new Error("Submission not found");
  // owner/admin can remove anyone; a collaborator can remove themselves
  if (sub.userId !== session.user.id && session.user.role !== "ADMIN" && userId !== session.user.id) throw new Error("Forbidden");
  await db.submissionCollaborator.deleteMany({ where: { submissionId: id, userId } });
  revalidatePath("/leaderboard");
  revalidatePath(`/submissions/${id}`);
  revalidatePath("/submissions");
}

export async function requeueSubmissionAction(id: string) {
  const { sub } = await ownedSubmission(id);
  if (sub.status !== "FAILED") throw new Error("Only failed submissions can be re-queued");
  if (!(await storage.exists(sub.fileKey))) throw new Error("The uploaded model file is no longer available; please submit again");
  await db.$transaction([
    db.submission.update({ where: { id }, data: { status: "QUEUED", failureMessage: null, completedAt: null } }),
    db.evaluationJob.upsert({ where: { submissionId: id }, create: { submissionId: id }, update: { attempts: 0, lockedAt: null, lockedBy: null, log: "" } }),
  ]);
  revalidatePath(`/submissions/${id}`);
}
