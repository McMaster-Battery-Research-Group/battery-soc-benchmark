import { isCurrentBenchmark, BENCHMARK_VERSION } from "@/lib/benchmark-version";
import type { Prisma } from "@prisma/client";
import { db } from "./db";
import { publicAuthors, AUTHOR_USER_SELECT, AUTHOR_COLLABORATORS } from "./authors";
import { METRIC_KEYS, type MetricKey } from "./test-cases";

export type LeaderboardRow = {
  id: string;
  seq: number;
  version: number;
  modelName: string;
  modelType: string;
  evaluationLevel: string;
  isPrivate: boolean;
  isHidden: boolean;
  submittedAt: string;
  completedAt: string | null;
  author: string;
  affiliation: string;
  /** account of the first public author (for the link and picture); null when that person has no account */
  userId: string | null;
  /** the uploading account: permissions, "mine" highlighting, contest entrant. May not be shown publicly. */
  ownerId: string;
  /** avatarUpdatedAt epoch ms, null when the author has no picture */
  avatarVersion: number | null;
  /** picture of a first author without an account */
  avatarSrc: string | null;
  /** the other public authors, in order */
  collaborators: { id: string | null; name: string; avatarVersion: number | null; avatarSrc: string | null }[];
  /** a score carried over from before this platform; no package, not re-evaluable */
  isLegacy: boolean;
  contestId: string | null;
  weightedError: number;
  complexity: number;
  complexityUncertainty: number;
  maxError: number;
  evaluatorVersion: string;
} & Record<MetricKey, number>;

const resultSelect = {
  weightedError: true,
  complexity: true,
  complexityUncertainty: true,
  maxError: true,
  evaluatorVersion: true,
  ...Object.fromEntries(METRIC_KEYS.map((k) => [k, true])),
} as Prisma.EvaluationResultSelect;

/**
 * Rows for the public leaderboard. Private submissions are included only for
 * `viewerId`; hidden submissions only for admins.
 */
export async function getLeaderboardRows(opts: { viewerId?: string; isAdmin?: boolean; contestId?: string | null; includeAllContestRows?: boolean } = {}): Promise<LeaderboardRow[]> {
  const where: Prisma.SubmissionWhereInput = {
    // completed, or re-evaluating a new version (its previous score stays visible meanwhile)
    status: { in: ["COMPLETED", "QUEUED", "RUNNING"] },
    result: { isNot: null },
    ...(opts.contestId ? { contestId: opts.contestId } : {}),
    AND: [
      opts.isAdmin ? {} : { isHidden: false },
      { OR: [{ isPrivate: false }, ...(opts.viewerId ? [{ userId: opts.viewerId }] : [])] },
    ],
  };
  const subs = await db.submission.findMany({
    where,
    omit: { creditAvatar: true },
    include: {
      user: { select: AUTHOR_USER_SELECT },
      collaborators: AUTHOR_COLLABORATORS,
      result: { select: resultSelect },
    },
    orderBy: { submittedAt: "desc" },
  });
  return subs
    .filter((s) => s.result)
    .map((s) => {
      const [first, ...rest] = publicAuthors(s);
      return {
      id: s.id,
      seq: s.seq,
      version: s.version,
      modelName: s.modelName,
      modelType: s.modelType,
      evaluationLevel: s.evaluationLevel,
      isPrivate: s.isPrivate,
      isHidden: s.isHidden,
      submittedAt: s.submittedAt.toISOString(),
      completedAt: s.completedAt?.toISOString() ?? null,
      // the public author list (src/lib/authors.ts); the owner account may not be on it
      author: first.name,
      affiliation: first.affiliation,
      userId: first.id,
      ownerId: s.userId,
      avatarVersion: first.avatarVersion,
      avatarSrc: first.avatarSrc,
      isLegacy: s.isLegacy,
      collaborators: rest.map((a) => ({ id: a.id, name: a.name, avatarVersion: a.avatarVersion, avatarSrc: a.avatarSrc })),
      contestId: s.contestId,
      ...(s.result as unknown as Record<MetricKey, number> & { weightedError: number; complexity: number; complexityUncertainty: number; maxError: number; evaluatorVersion: string }),
      };
    });
}

export async function getSubmissionDetail(id: string) {
  return db.submission.findUnique({
    where: { id },
    omit: { creditAvatar: true },
    include: {
      user: { select: { id: true, name: true, email: true, affiliation: true, avatarUpdatedAt: true } },
      collaborators: { orderBy: { addedAt: "asc" }, select: { id: true, userId: true, name: true, affiliation: true, avatarAt: true, notifiedAt: true, acceptedAt: true, user: { select: { id: true, name: true, email: true, affiliation: true, avatarUpdatedAt: true } } } },
      result: true,
      job: { select: { log: true, attempts: true, cancelRequestedAt: true } },
      contest: { select: { id: true, slug: true, title: true, status: true, startsAt: true, endsAt: true } },
    },
  });
}

export function canViewSubmission(sub: { userId: string; isPrivate: boolean; isHidden: boolean; collaborators?: { userId: string | null }[] }, viewer?: { id: string; role: string } | null) {
  if (viewer?.role === "ADMIN") return true;
  if (viewer?.id === sub.userId) return true;
  if (viewer && sub.collaborators?.some((c) => c.userId === viewer.id)) return true;
  return !sub.isPrivate && !sub.isHidden;
}

/**
 * Who may download the full-resolution traces (.mat). Unlike the results PAGE, these are NOT
 * public: the file carries every run at 1 Hz, and even with the blinded cell's answer key stripped
 * it is a heavier export than a public leaderboard entry should hand to anonymous visitors. Limited
 * to the owner, accepted collaborators (co-authors, who share the submission) and admins.
 */
export function canDownloadTraces(sub: { userId: string; collaborators?: { userId: string | null }[] }, viewer?: { id: string; role: string } | null) {
  if (!viewer) return false;
  if (viewer.role === "ADMIN") return true;
  if (viewer.id === sub.userId) return true;
  return !!sub.collaborators?.some((c) => c.userId === viewer.id);
}

export async function getSiteStats() {
  const [submissions, users, affiliations, best, contest] = await Promise.all([
    db.submission.count({ where: { status: "COMPLETED", isPrivate: false, isHidden: false } }),
    db.user.count({ where: { emailVerified: { not: null } } }),
    db.user.groupBy({ by: ["affiliation"], where: { submissions: { some: { status: "COMPLETED", isPrivate: false } } } }),
    db.evaluationResult.findFirst({
      where: { submission: { isPrivate: false, isHidden: false, status: "COMPLETED" }, evaluatorVersion: { startsWith: BENCHMARK_VERSION } },
      orderBy: { allCells: "asc" },
      select: { allCells: true, submission: { select: { modelName: true, id: true, user: { select: { name: true } } } } },
    }),
    db.contest.findFirst({ where: { status: { in: ["OPEN", "CLOSED"] }, endsAt: { gte: new Date() } }, orderBy: { startsAt: "asc" } }),
  ]);
  return { submissions, users, institutions: affiliations.length, best, contest };
}

export async function getOpenContest() {
  return db.contest.findFirst({ where: { status: { in: ["OPEN", "CLOSED"] }, endsAt: { gte: new Date() } }, orderBy: { startsAt: "asc" } });
}

/** 1-based public rank (lower weighted error is better) among current-benchmark, public, visible, completed submissions; null when the submission itself is not ranked. */
export async function publicRankOf(submissionId: string): Promise<number | null> {
  const me = await db.submission.findUnique({ where: { id: submissionId }, select: { isPrivate: true, isHidden: true, status: true, submittedAt: true, result: { select: { weightedError: true, allCells: true, evaluatorVersion: true } } } });
  if (!me?.result || me.isPrivate || me.isHidden || me.status !== "COMPLETED" || !isCurrentBenchmark(me.result.evaluatorVersion)) return null;
  // Strictly better = lower weighted error; ties break on all-cells RMSE, then earlier submission (same order as the
  // leaderboard table's rankById). The stamp is "<benchmark>/<runtime>".
  const { weightedError: w, allCells: ac } = me.result;
  const better = await db.submission.count({
    where: {
      isPrivate: false, isHidden: false, status: "COMPLETED",
      result: { evaluatorVersion: { startsWith: BENCHMARK_VERSION } },
      OR: [
        { result: { weightedError: { lt: w } } },
        ...(ac === null ? [] : [{ result: { weightedError: w, allCells: { lt: ac } } }, { result: { weightedError: w, allCells: ac }, submittedAt: { lt: me.submittedAt } }]),
      ],
    },
  });
  return better + 1;
}

/**
 * A collaborator row resolves to either a site account or a plain credit an administrator
 * entered for someone without one. `id` is null for the latter, which is what the UI keys on
 * to skip the avatar request and the link to a researcher page.
 */
export type CoAuthor = { id: string | null; name: string; affiliation: string; avatarVersion: number | null };

export function toCoAuthor(c: {
  name: string | null;
  affiliation: string | null;
  user: { id: string; name: string; affiliation: string; avatarUpdatedAt: Date | null } | null;
}): CoAuthor {
  if (c.user) return { id: c.user.id, name: c.user.name, affiliation: c.user.affiliation, avatarVersion: c.user.avatarUpdatedAt?.getTime() ?? null };
  return { id: null, name: c.name ?? "Unnamed co-author", affiliation: c.affiliation ?? "", avatarVersion: null };
}

/** The public author list of one submission (src/lib/authors.ts), for the PDF report, share image and exports. */
export async function getPublicAuthors(id: string) {
  const s = await db.submission.findUnique({ where: { id }, select: { id: true, creditName: true, creditAffiliation: true, creditAvatarAt: true, ownerDisplay: true, user: { select: AUTHOR_USER_SELECT }, collaborators: AUTHOR_COLLABORATORS } });
  return s ? publicAuthors(s) : [];
}
