"use server";

import { db } from "@/lib/db";
import { auth } from "@/lib/auth";

export type UserHit = { id: string; name: string; affiliation: string; occupation: string | null; avatarVersion: number | null };

const sel = { id: true, name: true, affiliation: true, occupation: true, avatarUpdatedAt: true } as const;
type Row = { id: string; name: string; affiliation: string; occupation: string | null; avatarUpdatedAt: Date | null };
const toHit = (u: Row): UserHit => ({ id: u.id, name: u.name, affiliation: u.affiliation, occupation: u.occupation, avatarVersion: u.avatarUpdatedAt?.getTime() ?? null });

/** Search registered, verified accounts by name, affiliation or exact email (emails are matched but never returned). */
export async function searchUsersAction(q: string): Promise<UserHit[]> {
  const session = await auth();
  if (!session?.user) return [];
  const term = q.trim();
  if (term.length < 2) return [];
  const users = await db.user.findMany({
    where: {
      emailVerified: { not: null },
      OR: [{ name: { contains: term, mode: "insensitive" } }, { affiliation: { contains: term, mode: "insensitive" } }, { email: { equals: term.toLowerCase() } }],
    },
    select: sel,
    orderBy: { name: "asc" },
    take: 12,
  });
  return users.map(toHit);
}

/**
 * Suggestions shown before the user types: people they have co-authored with
 * before, then colleagues at the same affiliation, then recently joined members.
 * `excludeSubmissionId` skips the submission being edited when looking up past co-authors.
 */
export async function suggestUsersAction(excludeSubmissionId?: string): Promise<{ hit: UserHit; reason: string }[]> {
  const session = await auth();
  if (!session?.user) return [];
  const me = await db.user.findUnique({ where: { id: session.user.id }, select: { affiliation: true } });

  const out: { hit: UserHit; reason: string }[] = [];
  const seen = new Set<string>([session.user.id]);
  const push = (u: Row, reason: string) => {
    if (seen.has(u.id) || out.length >= 8) return;
    seen.add(u.id);
    out.push({ hit: toHit(u), reason });
  };

  const mine = await db.submission.findMany({
    where: { OR: [{ userId: session.user.id }, { collaborators: { some: { userId: session.user.id } } }], ...(excludeSubmissionId ? { NOT: { id: excludeSubmissionId } } : {}) },
    select: { user: { select: sel }, collaborators: { select: { user: { select: sel } } } },
    orderBy: { submittedAt: "desc" },
    take: 30,
  });
  for (const s of mine) {
    push(s.user, "Previous co-author");
    for (const c of s.collaborators) push(c.user, "Previous co-author");
  }
  if (me?.affiliation) {
    const peers = await db.user.findMany({ where: { emailVerified: { not: null }, affiliation: { equals: me.affiliation, mode: "insensitive" }, id: { notIn: [...seen] } }, select: sel, orderBy: { name: "asc" }, take: 8 });
    for (const u of peers) push(u, me.affiliation);
  }
  if (out.length < 8) {
    const recent = await db.user.findMany({ where: { emailVerified: { not: null }, id: { notIn: [...seen] } }, select: sel, orderBy: { createdAt: "desc" }, take: 8 - out.length });
    for (const u of recent) push(u, "Recently joined");
  }
  return out;
}
