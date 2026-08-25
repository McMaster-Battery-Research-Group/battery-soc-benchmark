"use server";

import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
import { storage, MAX_UPLOAD_BYTES } from "@/lib/storage";
import { checkSubmissionPackage } from "@/lib/package-check";

const DRY_RUNS_PER_HOUR = 5;

export type DryRunStart = { ok: true; id: string } | { ok: false; error: string };

/**
 * Queue a pre-submission dry run: structural checks now, then validation + one
 * OPEN-data cycle on the evaluator. Never touches blinded data, never creates a
 * submission or leaderboard entry, doesn't count against contest limits.
 */
export async function startDryRunAction(fd: FormData): Promise<DryRunStart> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Sign in to test a package." };

  const since = new Date(Date.now() - 3600_000);
  const recent = await db.dryRun.count({ where: { userId: session.user.id, createdAt: { gt: since } } });
  if (recent >= DRY_RUNS_PER_HOUR) return { ok: false, error: `Limit reached: ${DRY_RUNS_PER_HOUR} test runs per hour. Try again later.` };

  let bytes: Buffer;
  let fileName: string;
  let preUploadedKey: string | null = null;
  const blobUrl = String(fd.get("fileUrl") ?? "");
  if (storage.mode === "blob" && blobUrl) {
    if (!/^https:\/\/[a-z0-9.-]+\.public\.blob\.vercel-storage\.com\//.test(blobUrl)) return { ok: false, error: "Invalid upload reference" };
    fileName = String(fd.get("fileName") ?? "model.zip");
    try {
      bytes = await storage.getBytes(blobUrl);
    } catch {
      return { ok: false, error: "The uploaded package could not be retrieved." };
    }
    preUploadedKey = blobUrl;
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
  return { ok: true, id: dr.id };
}
