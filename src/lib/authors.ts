/**
 * Who a submission is publicly credited to, in order. The single source for every place an author
 * list is shown (leaderboard, submission page, PDF, share image, results download, profiles).
 *
 * A submission has an OWNER account (the uploader: permissions, e-mail, new versions) and up to three
 * kinds of public author:
 *  - a display credit (creditName): someone without an account, shown first;
 *  - the owner, shown first ("lead"), last ("coauthor") or not at all ("hidden");
 *  - co-authors (accepted ones only): accounts, or names an administrator / the uploader entered.
 * ownerDisplay null keeps the original rule: the owner is hidden behind a credit, otherwise the lead.
 * The list is never empty: with everyone else hidden or pending, the owner is shown.
 */

import { teamPhotoFor } from "@/lib/people";

export type PublicAuthor = {
  /** account id, null for someone without an account */
  id: string | null;
  name: string;
  affiliation: string;
  /** profile-picture version for accounts (cache busting) */
  avatarVersion: number | null;
  /** picture URL for someone without an account, null when there is none */
  avatarSrc: string | null;
};

export type OwnerDisplay = "lead" | "coauthor" | "hidden";

type AuthorSource = {
  id: string;
  creditName: string | null;
  creditAffiliation: string | null;
  creditAvatarAt?: Date | null;
  ownerDisplay?: string | null;
  user: { id: string; name: string; affiliation: string; avatarUpdatedAt: Date | null };
  /** in display order (addedAt ascending) */
  collaborators: {
    id: string;
    name: string | null;
    affiliation: string | null;
    avatarAt?: Date | null;
    acceptedAt: Date | null;
    user: { id: string; name: string; affiliation: string; avatarUpdatedAt: Date | null } | null;
  }[];
};

export const ownerDisplayOf = (s: { creditName: string | null; ownerDisplay?: string | null }): OwnerDisplay =>
  (s.ownerDisplay as OwnerDisplay | null) ?? (s.creditName ? "hidden" : "lead");

export const guestAvatarUrl = (submissionId: string, who: string, at: Date) => `/api/submissions/${submissionId}/author-avatar/${who}?v=${at.getTime()}`;

/** Picture of someone without an account: their uploaded photo, else their team photo from the About page, else none. */
export const guestAvatar = (submissionId: string, who: string, at: Date | null | undefined, name: string) => (at ? guestAvatarUrl(submissionId, who, at) : teamPhotoFor(name));

export function publicAuthors(s: AuthorSource): PublicAuthor[] {
  const owner: PublicAuthor = { id: s.user.id, name: s.user.name, affiliation: s.user.affiliation, avatarVersion: s.user.avatarUpdatedAt?.getTime() ?? null, avatarSrc: null };
  const display = ownerDisplayOf(s);
  const co = s.collaborators
    .filter((c) => c.acceptedAt)
    .map((c): PublicAuthor =>
      c.user
        ? { id: c.user.id, name: c.user.name, affiliation: c.user.affiliation, avatarVersion: c.user.avatarUpdatedAt?.getTime() ?? null, avatarSrc: null }
        : { id: null, name: c.name ?? "Unnamed co-author", affiliation: c.affiliation ?? "", avatarVersion: null, avatarSrc: guestAvatar(s.id, c.id, c.avatarAt, c.name ?? "") },
    );
  const list = [
    ...(s.creditName ? [{ id: null, name: s.creditName, affiliation: s.creditAffiliation ?? "", avatarVersion: null, avatarSrc: guestAvatar(s.id, "credit", s.creditAvatarAt, s.creditName) }] : []),
    ...(display === "lead" ? [owner] : []),
    ...co,
    ...(display === "coauthor" ? [owner] : []),
  ];
  return list.length ? list : [owner];
}

/** Is the owner account publicly listed on this submission (after the never-empty fallback)? */
export function ownerIsShown(s: AuthorSource) {
  return publicAuthors(s).some((a) => a.id === s.user.id);
}

/** Prisma include/select fragments that provide everything publicAuthors() reads. */
export const AUTHOR_USER_SELECT = { id: true, name: true, affiliation: true, avatarUpdatedAt: true } as const;
export const AUTHOR_COLLABORATORS = {
  orderBy: { addedAt: "asc" as const },
  select: { id: true, name: true, affiliation: true, avatarAt: true, acceptedAt: true, user: { select: AUTHOR_USER_SELECT } },
};

// ---- pictures for people without an account (same format as profile pictures) ----

/** Parse a data URL produced by resizeAvatar(); null if absent, an error string if unusable. */
export function parseAvatarDataUrl(data: string): { bytes: Buffer } | { error: string } | null {
  if (!data) return null;
  const m = /^data:image\/(?:jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/.exec(data);
  if (!m) return { error: "The picture could not be read. Try a JPEG or PNG." };
  const bytes = Buffer.from(m[1], "base64");
  if (bytes.length > 400 * 1024) return { error: "Picture is too large after resizing. Try a smaller image." };
  return { bytes };
}
