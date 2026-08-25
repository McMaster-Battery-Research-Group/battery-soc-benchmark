import type { Prisma } from "@prisma/client";
import { db } from "./db";
import { METRIC_KEYS, type MetricKey } from "./test-cases";

export type LeaderboardRow = {
  id: string;
  seq: number;
  modelName: string;
  modelType: string;
  evaluationLevel: string;
  isPrivate: boolean;
  isHidden: boolean;
  submittedAt: string;
  completedAt: string | null;
  author: string;
  affiliation: string;
  userId: string;
  contestId: string | null;
  weightedError: number;
  complexity: number;
  complexityUncertainty: number;
  maxError: number;
} & Record<MetricKey, number>;

const resultSelect = {
  weightedError: true,
  complexity: true,
  complexityUncertainty: true,
  maxError: true,
  ...Object.fromEntries(METRIC_KEYS.map((k) => [k, true])),
} as Prisma.EvaluationResultSelect;

/**
 * Rows for the public leaderboard. Private submissions are included only for
 * `viewerId`; hidden submissions only for admins.
 */
export async function getLeaderboardRows(opts: { viewerId?: string; isAdmin?: boolean; contestId?: string | null; includeAllContestRows?: boolean } = {}): Promise<LeaderboardRow[]> {
  const where: Prisma.SubmissionWhereInput = {
    status: "COMPLETED",
    result: { isNot: null },
    ...(opts.contestId ? { contestId: opts.contestId } : {}),
    AND: [
      opts.isAdmin ? {} : { isHidden: false },
      { OR: [{ isPrivate: false }, ...(opts.viewerId ? [{ userId: opts.viewerId }] : [])] },
    ],
  };
  const subs = await db.submission.findMany({
    where,
    include: { user: { select: { name: true, affiliation: true } }, result: { select: resultSelect } },
    orderBy: { submittedAt: "desc" },
  });
  return subs
    .filter((s) => s.result)
    .map((s) => ({
      id: s.id,
      seq: s.seq,
      modelName: s.modelName,
      modelType: s.modelType,
      evaluationLevel: s.evaluationLevel,
      isPrivate: s.isPrivate,
      isHidden: s.isHidden,
      submittedAt: s.submittedAt.toISOString(),
      completedAt: s.completedAt?.toISOString() ?? null,
      author: s.user.name,
      affiliation: s.user.affiliation,
      userId: s.userId,
      contestId: s.contestId,
      ...(s.result as unknown as Record<MetricKey, number> & { weightedError: number; complexity: number; complexityUncertainty: number; maxError: number }),
    }));
}

export async function getSubmissionDetail(id: string) {
  return db.submission.findUnique({
    where: { id },
    include: {
      user: { select: { id: true, name: true, affiliation: true } },
      result: true,
      job: { select: { log: true, attempts: true } },
      contest: { select: { id: true, slug: true, title: true, status: true } },
    },
  });
}

export function canViewSubmission(sub: { userId: string; isPrivate: boolean; isHidden: boolean }, viewer?: { id: string; role: string } | null) {
  if (viewer?.role === "ADMIN") return true;
  if (viewer?.id === sub.userId) return true;
  return !sub.isPrivate && !sub.isHidden;
}

export async function getSiteStats() {
  const [submissions, users, affiliations, best, contest] = await Promise.all([
    db.submission.count({ where: { status: "COMPLETED", isPrivate: false, isHidden: false } }),
    db.user.count({ where: { emailVerified: { not: null } } }),
    db.user.groupBy({ by: ["affiliation"], where: { submissions: { some: { status: "COMPLETED", isPrivate: false } } } }),
    db.evaluationResult.findFirst({
      where: { submission: { isPrivate: false, isHidden: false } },
      orderBy: { allCells: "asc" },
      select: { allCells: true, submission: { select: { modelName: true, id: true, user: { select: { name: true } } } } },
    }),
    db.contest.findFirst({ where: { status: "OPEN" }, orderBy: { endsAt: "asc" } }),
  ]);
  return { submissions, users, institutions: affiliations.length, best, contest };
}

export async function getOpenContest() {
  return db.contest.findFirst({ where: { status: "OPEN" }, orderBy: { endsAt: "asc" } });
}
