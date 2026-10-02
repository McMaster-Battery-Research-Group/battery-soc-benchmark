"use server";

import { revalidatePath } from "next/cache";

import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { logEvent } from "@/lib/log";
import { recordAdminEvent } from "@/lib/admin-notify";

/**
 * Administrator credit and legacy records.
 *
 * A submission's `userId` is its OWNER: it governs permissions, e-mail and deletion. The credit
 * fields below are purely about attribution — set them and the entry is shown as that person's
 * work everywhere, whether or not they have an account. That separation is what lets a
 * submission be credited to someone who will never register.
 *
 * A legacy entry is a score from before this platform existed: it has an owner (the administrator
 * who entered it), a credit naming the real author, a headline figure, and no package — so it can
 * never be re-evaluated and is badged wherever it appears.
 */

function clean(s: string, max: number) {
  return s.trim().replace(/\s+/g, " ").slice(0, max);
}

/** Show this submission as someone else's work. Pass an empty name to clear the credit. */
export async function setSubmissionCreditAction(id: string, name: string, affiliation: string): Promise<{ ok: true; message: string } | { ok: false; error: string }> {
  const admin = await requireAdmin();
  const who = clean(name, 120);
  const where = clean(affiliation, 160);

  const sub = await db.submission.findUnique({ where: { id }, select: { seq: true, modelName: true, creditName: true, user: { select: { name: true } } } });
  if (!sub) return { ok: false, error: "Submission not found." };

  if (!who) {
    if (!sub.creditName) return { ok: false, error: "This entry has no credit to clear." };
    await db.submission.update({ where: { id }, data: { creditName: null, creditAffiliation: null } });
    logEvent("admin.credit_cleared", { id, seq: sub.seq, by: admin.id });
    await recordAdminEvent("deletions", `${admin.name} cleared the display credit on #${sub.seq} "${sub.modelName}"; it is shown as ${sub.user.name}'s work again`);
  } else {
    if (who.length < 2) return { ok: false, error: "Enter the person's full name." };
    await db.submission.update({ where: { id }, data: { creditName: who, creditAffiliation: where || null } });
    logEvent("admin.credit_set", { id, seq: sub.seq, by: admin.id, name: who });
    await recordAdminEvent("deletions", `${admin.name} credited #${sub.seq} "${sub.modelName}" to ${who}${where ? ` (${where})` : ""}; the owner account is unchanged`);
  }

  revalidatePath("/leaderboard");
  revalidatePath(`/submissions/${id}`);
  revalidatePath("/submissions");
  revalidatePath("/admin/submissions");
  return { ok: true, message: who ? `Credited to ${who}` : "Credit cleared" };
}

export type LegacyEntry = {
  modelName: string;
  creditName: string;
  creditAffiliation: string;
  modelType: string;
  weightedError: number;
  allCells?: number | null;
  maxError?: number | null;
  source: string;
  submittedAt?: string;
};

/**
 * Records a score that predates this platform. Creates a completed submission with no package,
 * owned by the administrator entering it and credited to the real author.
 */
export async function createLegacyEntryAction(input: LegacyEntry): Promise<{ ok: true; seq: number } | { ok: false; error: string }> {
  const admin = await requireAdmin();
  const modelName = clean(input.modelName, 120);
  const creditName = clean(input.creditName, 120);
  const source = clean(input.source, 300);
  const weightedError = Number(input.weightedError);

  if (modelName.length < 2) return { ok: false, error: "Enter the model name." };
  if (creditName.length < 2) return { ok: false, error: "Enter who this score belongs to." };
  if (!Number.isFinite(weightedError) || weightedError < 0 || weightedError > 100) return { ok: false, error: "Weighted error must be a percentage between 0 and 100." };
  if (source.length < 3) return { ok: false, error: "Say where this score came from; it is shown on the entry." };

  const when = input.submittedAt ? new Date(input.submittedAt) : new Date();
  if (Number.isNaN(when.getTime())) return { ok: false, error: "That date could not be read." };

  const maxError = input.maxError == null || input.maxError === ("" as unknown) ? null : Number(input.maxError);
  const allCells = input.allCells == null || input.allCells === ("" as unknown) ? null : Number(input.allCells);

  const sub = await db.submission.create({
    data: {
      userId: admin.id, // owner for permissions only; the credit below is who it is shown as
      modelName,
      description: `Carried over from before this platform. ${source}`,
      modelType: input.modelType as never,
      creditName,
      creditAffiliation: clean(input.creditAffiliation, 160) || null,
      isLegacy: true,
      legacySource: source,
      status: "COMPLETED",
      submittedAt: when,
      completedAt: when,
      result: {
        create: {
          weightedError,
          // only the headline figures are known; every test-case metric stays null and renders as "—"
          maxError: maxError ?? weightedError,
          allCells,
          complexity: 0,
          complexityUncertainty: 0,
          perCycle: [],
          timeSeries: [],
          evaluatorVersion: "legacy/manual",
        },
      },
    },
    select: { seq: true, id: true },
  });

  logEvent("admin.legacy_created", { id: sub.id, seq: sub.seq, by: admin.id, creditName, weightedError });
  await recordAdminEvent("deletions", `${admin.name} recorded a legacy score: #${sub.seq} "${modelName}" by ${creditName}, weighted error ${weightedError} % (${source})`);
  revalidatePath("/leaderboard");
  revalidatePath("/admin/submissions");
  return { ok: true, seq: sub.seq };
}
