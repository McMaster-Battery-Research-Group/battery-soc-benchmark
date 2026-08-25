"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
import { storage, MAX_UPLOAD_BYTES } from "@/lib/storage";
import { checkSubmissionPackage } from "@/lib/package-check";
import { submissionMetaSchema, zodErrors, type FieldErrors } from "@/lib/validation";

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

  // The package arrives either as a multipart file (STORAGE=local) or as a
  // Vercel Blob URL the browser uploaded to directly (STORAGE=blob).
  let bytes: Buffer;
  let fileName: string;
  let fileSize: number;
  let preUploadedKey: string | null = null;
  const blobUrl = String(fd.get("fileUrl") ?? "");
  if (storage.mode === "blob" && blobUrl) {
    if (!/^https:\/\/[a-z0-9.-]+\.public\.blob\.vercel-storage\.com\//.test(blobUrl)) return { errors: { file: "Invalid upload reference" }, values };
    fileName = String(fd.get("fileName") ?? "model.zip");
    try {
      bytes = await storage.getBytes(blobUrl);
    } catch {
      return { errors: { file: "The uploaded package could not be retrieved. Please try again." }, values };
    }
    fileSize = bytes.length;
    preUploadedKey = blobUrl;
  } else {
    const file = fd.get("file");
    if (!(file instanceof File) || file.size === 0) return { errors: { file: "Upload your submission package (.zip containing Model.m or Model.p and Settings.xlsx)" }, values };
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
    },
  });
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
