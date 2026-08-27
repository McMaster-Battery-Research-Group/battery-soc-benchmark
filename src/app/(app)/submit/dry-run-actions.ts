"use server";

import { logEvent } from "@/lib/log";

import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
import { storage, MAX_UPLOAD_BYTES, OBJECT_KEY_RE } from "@/lib/storage";
import { checkSubmissionPackage } from "@/lib/package-check";
import { dryRunLimitError } from "@/lib/dry-run-quota";

export type DryRunStart = { ok: true; id: string } | { ok: false; error: string };

/**
 * Queue a pre-submission dry run: structural checks now, then validation + one
 * OPEN-data cycle on the evaluator. Never touches blinded data, never creates a
 * submission or leaderboard entry, doesn't count against contest limits.
 */
export async function startDryRunAction(fd: FormData): Promise<DryRunStart> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Sign in to test a package." };

  const limit = await dryRunLimitError(session.user);
  if (limit) return { ok: false, error: limit };

  let bytes: Buffer;
  let fileName: string;
  let preUploadedKey: string | null = null;
  const uploadedKey = String(fd.get("fileKey") ?? "");
  if (storage.mode === "supabase" && uploadedKey) {
    if (!OBJECT_KEY_RE.test(uploadedKey)) return { ok: false, error: "Invalid upload reference" };
    fileName = String(fd.get("fileName") ?? "model.zip");
    try {
      bytes = await storage.getBytes(uploadedKey);
    } catch {
      return { ok: false, error: "The uploaded package could not be retrieved." };
    }
    preUploadedKey = uploadedKey;
  } else {
    const file = fd.get("file");
    if (!(file instanceof File) || file.size === 0) return { ok: false, error: "Choose a .zip package first." };
    fileName = file.name;
    bytes = Buffer.from(await file.arrayBuffer());
  }
  const reject = async (error: string): Promise<DryRunStart> => {
    if (preUploadedKey) await storage.remove(preUploadedKey);
    return { ok: false, error };
  };
  if (!fileName.toLowerCase().endsWith(".zip")) return reject("Only .zip packages are accepted.");
  if (bytes.length > MAX_UPLOAD_BYTES) return reject(`File exceeds the ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)} MB limit.`);
  const check = checkSubmissionPackage(bytes);
  if (!check.ok) return reject(check.problems.join(" "));

  const key = preUploadedKey ?? (await storage.put(bytes, "zip"));
  const dr = await db.dryRun.create({ data: { userId: session.user.id, fileKey: key, fileName, fileSize: bytes.length } });
  logEvent("dryrun.queued", { id: dr.id, userId: session.user.id, fileName, fileKB: Math.round(bytes.length / 1024) });
  return { ok: true, id: dr.id };
}
