"use server";

import { readFile } from "fs/promises";
import path from "path";

import { revalidatePath } from "next/cache";

import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { logEvent } from "@/lib/log";
import { storage } from "@/lib/storage";
import { EXAMPLES } from "@/lib/examples";

/**
 * Queues N copies of one bundled example at once, so the evaluation host can be tested at a
 * given concurrency without submitting by hand. Manual submissions drift apart — the first
 * finishes before the last is queued — which is exactly what this avoids: every copy is created
 * in one transaction, so the worker claims them together.
 *
 * The submissions are real (they occupy the queue and produce results) but are marked private
 * and hidden, so they never reach the public leaderboard.
 */

const MAX_COPIES = 12;

export async function startLoadTestAction(slug: string, runtime: "python" | "matlab", copies: number): Promise<{ ok: true; seqs: number[] } | { ok: false; error: string }> {
  const admin = await requireAdmin();
  const n = Math.round(Number(copies));
  if (!(n >= 1 && n <= MAX_COPIES)) return { ok: false, error: `Choose between 1 and ${MAX_COPIES} copies.` };

  const example = EXAMPLES.find((e) => e.slug === slug);
  if (!example) return { ok: false, error: "Unknown example." };
  if (runtime !== "python" && runtime !== "matlab") return { ok: false, error: "Runtime must be python or matlab." };
  const fileName = `${example.slug}.${runtime}.zip`;

  // the bundled package, read once and stored once per copy (packages are deleted after evaluation,
  // so each run needs its own object)
  const file = path.resolve(process.cwd(), "evaluator", "examples", fileName);
  let bytes: Buffer;
  try {
    bytes = await readFile(file);
  } catch {
    return { ok: false, error: `Could not read ${fileName} on the web host.` };
  }

  const stamp = new Date().toISOString().slice(11, 19);
  const created: { id: string; seq: number }[] = [];

  for (let i = 1; i <= n; i++) {
    const key = await storage.put(bytes, "zip");
    const sub = await db.submission.create({
      data: {
        userId: admin.id,
        modelName: `Load test ${stamp} · ${example.name} (${runtime}) ${i}/${n}`,
        description: `Automated concurrency test started by ${admin.name ?? "an administrator"}. Not a real submission.`,
        modelType: example.modelType as never,
        fileKey: key,
        fileName,
        fileType: "ZIP",
        fileSize: bytes.length,
        runtime,
        isPrivate: true,
        isHidden: true,
        status: "QUEUED",
      },
      select: { id: true, seq: true },
    });
    created.push(sub);
  }

  // create every job in one transaction so the worker sees them together rather than in sequence
  await db.$transaction(created.map((s) => db.evaluationJob.create({ data: { submissionId: s.id } })));

  logEvent("admin.load_test", { by: admin.id, example: slug, runtime, copies: n, seqs: created.map((s) => s.seq) });
  revalidatePath("/admin/workers");
  revalidatePath("/admin/submissions");
  return { ok: true, seqs: created.map((s) => s.seq) };
}

/** Deletes every load-test submission and its stored package. */
export async function clearLoadTestsAction(): Promise<{ ok: true; removed: number } | { ok: false; error: string }> {
  await requireAdmin();
  const subs = await db.submission.findMany({
    where: { modelName: { startsWith: "Load test " }, isHidden: true },
    select: { id: true, fileKey: true, status: true, result: { select: { tracesKey: true } } },
  });
  let removed = 0;
  for (const s of subs) {
    if (s.status === "RUNNING") continue; // cancel it first; deleting mid-run orphans a container
    if (s.fileKey) await storage.remove(s.fileKey).catch(() => {});
    if (s.result?.tracesKey) await storage.remove(s.result.tracesKey).catch(() => {});
    await db.submission.delete({ where: { id: s.id } });
    removed++;
  }
  revalidatePath("/admin/workers");
  revalidatePath("/admin/submissions");
  return { ok: true, removed };
}
