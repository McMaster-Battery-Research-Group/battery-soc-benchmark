"use server";

import { revalidatePath } from "next/cache";

import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { logEvent } from "@/lib/log";
import { recordAdminEvent } from "@/lib/admin-notify";
import { parseAvatarDataUrl } from "@/lib/authors";

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
  | {
      kind: "guest";
      key: string;
      name: string;
      affiliation: string;
      /** where this person's existing picture lives: a co-author row id, or "credit"; absent for a new person */
      from?: string;
      /** picture: undefined = keep the existing one, null = remove it, string = new data URL (resizeAvatar) */
      photo?: string | null;
    };

/**
 * Save the whole author list in one go (admin authorship editor). `people` is the public list in
 * order, minus anyone removed; `lead` is the key of the person shown first.
 *  - lead = owner account: no display credit; the owner is shown first.
 *  - lead = someone without an account: they become the display credit (with their picture); the
 *    owner keeps control and is listed after the others if still in the list, otherwise not at all.
 *  - lead = another account: that account becomes the owner; the former owner stays only if still listed.
 * Nobody is e-mailed. Account co-authors keep their invitation state; new ones are listed as accepted.
 */
export async function saveAuthorsAction(id: string, people: AuthorDraft[], lead: string): Promise<{ ok: true; message: string } | { ok: false; error: string }> {
  const admin = await requireAdmin();
  const sub = await db.submission.findUnique({
    where: { id },
    select: { seq: true, modelName: true, userId: true, creditAvatar: true, creditAvatarAt: true, user: { select: { name: true } }, collaborators: { where: { userId: null }, select: { id: true, avatar: true, avatarAt: true } } },
  });
  if (!sub) return { ok: false, error: "Submission not found." };
  const leader = people.find((p) => p.key === lead);
  if (!leader) return { ok: false, error: "Choose who is shown as the lead author." };

  const guests = people.filter((p): p is Extract<AuthorDraft, { kind: "guest" }> => p.kind === "guest").map((g) => ({ ...g, name: clean(g.name, 120), affiliation: clean(g.affiliation, 160) }));
  if (guests.some((g) => g.name.length < 2)) return { ok: false, error: "Every person without an account needs a full name." };
  const accountIds = people.flatMap((p) => (p.kind === "account" ? [p.userId] : []));
  if (new Set(accountIds).size !== accountIds.length || accountIds.includes(sub.userId)) return { ok: false, error: "The same account is listed twice." };
  const ownerListed = people.some((p) => p.kind === "owner");

  // pictures of people without an account: kept, removed or replaced per the draft
  const now = new Date();
  const existing = new Map<string, { avatar: Uint8Array | null; avatarAt: Date | null }>(sub.collaborators.map((c) => [c.id, { avatar: c.avatar, avatarAt: c.avatarAt }]));
  existing.set("credit", { avatar: sub.creditAvatar, avatarAt: sub.creditAvatarAt });
  const pictures = new Map<string, { bytes: Uint8Array<ArrayBuffer> | null; at: Date | null }>();
  for (const g of guests) {
    if (g.photo === undefined) {
      const e = g.from ? existing.get(g.from) : undefined;
      pictures.set(g.key, { bytes: e?.avatar ? new Uint8Array(e.avatar) : null, at: e?.avatarAt ?? null });
    } else if (g.photo === null) {
      pictures.set(g.key, { bytes: null, at: null });
    } else {
      const p = parseAvatarDataUrl(g.photo);
      if (p && "error" in p) return { ok: false, error: `${g.name}: ${p.error}` };
      pictures.set(g.key, p ? { bytes: new Uint8Array(p.bytes), at: now } : { bytes: null, at: null });
    }
  }

  const newOwnerId = leader.kind === "account" ? leader.userId : sub.userId;
  if (leader.kind === "account" && !(await db.user.findUnique({ where: { id: newOwnerId }, select: { id: true } }))) return { ok: false, error: "That account no longer exists." };
  // co-authors = everyone listed except the lead and whoever ends up owning it, in list order
  const co = people.filter((p) => p.key !== lead && !(p.kind === "account" && p.userId === newOwnerId) && !(p.kind === "owner" && newOwnerId === sub.userId));
  const coAccounts = co.flatMap((p) => (p.kind === "account" ? [p.userId] : p.kind === "owner" ? [sub.userId] : []));
  const coGuests = guests.filter((g) => g.key !== lead);
  if (co.length > 10) return { ok: false, error: "A submission can have at most 10 co-authors." };
  const lg = leader.kind === "guest" ? guests.find((g) => g.key === lead)! : null;
  const lgPic = lg ? pictures.get(lg.key)! : null;
  // where the (new) owner sits in the public list; the list order of the co-authors is kept via addedAt
  const ownerDisplay = leader.kind !== "guest" ? "lead" : ownerListed ? "coauthor" : "hidden";
  const order = new Map(co.map((p, i) => [p.key, new Date(now.getTime() + i)]));

  await db.$transaction([
    db.submission.update({
      where: { id },
      data: { userId: newOwnerId, ownerDisplay, creditName: lg?.name ?? null, creditAffiliation: lg ? lg.affiliation || null : null, creditAvatar: lgPic?.bytes ?? null, creditAvatarAt: lgPic?.bytes ? (lgPic.at ?? now) : null },
    }),
    // account co-authors: drop the ones no longer listed, keep the invitation state of the rest
    db.submissionCollaborator.deleteMany({ where: { submissionId: id, userId: { not: null, notIn: coAccounts } } }),
    ...co.flatMap((p) =>
      p.kind === "guest"
        ? []
        : [
            db.submissionCollaborator.upsert({
              where: { submissionId_userId: { submissionId: id, userId: p.kind === "owner" ? sub.userId : p.userId } },
              create: { submissionId: id, userId: p.kind === "owner" ? sub.userId : p.userId, acceptedAt: now, notifiedAt: now, addedAt: order.get(p.key) },
              update: { addedAt: order.get(p.key) },
            }),
          ],
    ),
    // people without an account have no invitation state: rewrite them, carrying their pictures
    db.submissionCollaborator.deleteMany({ where: { submissionId: id, userId: null } }),
    ...coGuests.map((g) => {
      const pic = pictures.get(g.key)!;
      return db.submissionCollaborator.create({ data: { submissionId: id, name: g.name, affiliation: g.affiliation || null, avatar: pic.bytes, avatarAt: pic.bytes ? (pic.at ?? now) : null, acceptedAt: now, notifiedAt: now, addedAt: order.get(g.key) } });
    }),
  ]);

  const leadName = lg?.name ?? (leader.kind === "account" ? (await db.user.findUnique({ where: { id: newOwnerId }, select: { name: true } }))?.name : sub.user.name) ?? "?";
  logEvent("admin.authors_saved", { id, seq: sub.seq, by: admin.id, lead: leadName, owner: newOwnerId, ownerDisplay, coAccounts: coAccounts.length, coGuests: coGuests.length });
  await recordAdminEvent(
    "deletions",
    `${admin.name} set the authors of #${sub.seq} "${sub.modelName}": ${[leadName, ...coGuests.map((g) => g.name)].join(", ")}${coAccounts.length ? ` + ${coAccounts.length} account co-author${coAccounts.length === 1 ? "" : "s"}` : ""}${newOwnerId !== sub.userId ? `; ownership moved from ${sub.user.name}` : ownerDisplay === "hidden" ? `; ${sub.user.name} is not shown` : ""}`,
  );
  revalidatePath("/leaderboard");
  revalidatePath("/");
  revalidatePath(`/submissions/${id}`);
  revalidatePath("/submissions");
  revalidatePath("/admin/submissions");
  return { ok: true, message: "Authors saved" };
}
