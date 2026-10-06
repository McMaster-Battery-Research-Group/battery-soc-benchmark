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

/** One person in the authorship editor. `owner` is the account that uploaded / controls the submission. */
export type AuthorDraft =
  | { kind: "owner"; key: string }
  | { kind: "account"; key: string; userId: string }
  | { kind: "guest"; key: string; name: string; affiliation: string };

/**
 * Save the whole author list in one go (admin authorship editor). `people` is the public list in
 * order, minus anyone removed; `lead` is the key of the person shown first.
 *  - lead = owner account: no display credit; the owner is shown first.
 *  - lead = someone without an account: they become the display credit; the owner keeps control but is not shown.
 *  - lead = another account: that account becomes the owner; the former owner stays only if still listed.
 * Nobody is e-mailed. Account co-authors keep their invitation state; new ones are listed as accepted.
 */
export async function saveAuthorsAction(id: string, people: AuthorDraft[], lead: string): Promise<{ ok: true; message: string } | { ok: false; error: string }> {
  const admin = await requireAdmin();
  const sub = await db.submission.findUnique({ where: { id }, select: { seq: true, modelName: true, userId: true, user: { select: { name: true } }, collaborators: { select: { id: true, userId: true } } } });
  if (!sub) return { ok: false, error: "Submission not found." };
  const leader = people.find((p) => p.key === lead);
  if (!leader) return { ok: false, error: "Choose who is shown as the lead author." };

  const guests = people.filter((p): p is Extract<AuthorDraft, { kind: "guest" }> => p.kind === "guest").map((g) => ({ ...g, name: clean(g.name, 120), affiliation: clean(g.affiliation, 160) }));
  if (guests.some((g) => g.name.length < 2)) return { ok: false, error: "Every person without an account needs a full name." };
  const accountIds = people.flatMap((p) => (p.kind === "account" ? [p.userId] : []));
  if (new Set(accountIds).size !== accountIds.length || accountIds.includes(sub.userId)) return { ok: false, error: "The same account is listed twice." };
  const ownerListed = people.some((p) => p.kind === "owner");
  if (leader.kind === "guest" && ownerListed) return { ok: false, error: "When someone without an account is the lead, the uploading account cannot also be listed." };

  const newOwnerId = leader.kind === "account" ? leader.userId : sub.userId;
  if (leader.kind === "account" && !(await db.user.findUnique({ where: { id: newOwnerId }, select: { id: true } }))) return { ok: false, error: "That account no longer exists." };
  // co-authors = everyone listed except the lead and whoever ends up owning it
  const coAccounts = [...accountIds.filter((u) => u !== newOwnerId), ...(leader.kind === "account" && ownerListed ? [sub.userId] : [])];
  const coGuests = guests.filter((g) => g.key !== lead);
  if (coAccounts.length + coGuests.length > 10) return { ok: false, error: "A submission can have at most 10 co-authors." };
  const lg = leader.kind === "guest" ? guests.find((g) => g.key === lead)! : null;

  const now = new Date();
  await db.$transaction([
    db.submission.update({ where: { id }, data: { userId: newOwnerId, creditName: lg?.name ?? null, creditAffiliation: lg ? lg.affiliation || null : null } }),
    // account co-authors: drop the ones no longer listed, keep the invitation state of the rest
    db.submissionCollaborator.deleteMany({ where: { submissionId: id, userId: { not: null, notIn: coAccounts } } }),
    ...coAccounts.map((userId) =>
      db.submissionCollaborator.upsert({ where: { submissionId_userId: { submissionId: id, userId } }, create: { submissionId: id, userId, acceptedAt: now, notifiedAt: now }, update: {} }),
    ),
    // people without an account have no state worth keeping: rewrite them in the given order
    db.submissionCollaborator.deleteMany({ where: { submissionId: id, userId: null } }),
    ...coGuests.map((g, i) => db.submissionCollaborator.create({ data: { submissionId: id, name: g.name, affiliation: g.affiliation || null, acceptedAt: now, notifiedAt: now, addedAt: new Date(now.getTime() + i) } })),
  ]);

  const leadName = lg?.name ?? (leader.kind === "account" ? (await db.user.findUnique({ where: { id: newOwnerId }, select: { name: true } }))?.name : sub.user.name) ?? "?";
  logEvent("admin.authors_saved", { id, seq: sub.seq, by: admin.id, lead: leadName, owner: newOwnerId, coAccounts: coAccounts.length, coGuests: coGuests.length });
  await recordAdminEvent(
    "deletions",
    `${admin.name} set the authors of #${sub.seq} "${sub.modelName}": ${[leadName, ...coGuests.map((g) => g.name)].join(", ")}${coAccounts.length ? ` + ${coAccounts.length} account co-author${coAccounts.length === 1 ? "" : "s"}` : ""}${newOwnerId !== sub.userId ? `; ownership moved from ${sub.user.name}` : ""}`,
  );
  revalidatePath("/leaderboard");
  revalidatePath("/");
  revalidatePath(`/submissions/${id}`);
  revalidatePath("/submissions");
  revalidatePath("/admin/submissions");
  return { ok: true, message: "Authors saved" };
}
