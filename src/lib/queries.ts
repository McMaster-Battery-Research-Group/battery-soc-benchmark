import { isCurrentBenchmark, BENCHMARK_VERSION } from "@/lib/benchmark-version";
import type { Prisma } from "@prisma/client";
import { db } from "./db";
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
  userId: string;
  /** avatarUpdatedAt epoch ms, null when the author has no picture */
  avatarVersion: number | null;
  collaborators: { id: string; name: string; avatarVersion: number | null }[];
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
    include: {
      user: { select: { name: true, affiliation: true, avatarUpdatedAt: true } },
      // only accepted co-authors are public
      collaborators: { where: { acceptedAt: { not: null } }, include: { user: { select: { id: true, name: true, avatarUpdatedAt: true } } }, orderBy: { addedAt: "asc" } },
      result: { select: resultSelect },
    },
    orderBy: { submittedAt: "desc" },
  });
  return subs
    .filter((s) => s.result)
    .map((s) => ({
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
      author: s.user.name,
      affiliation: s.user.affiliation,
      userId: s.userId,
      avatarVersion: s.user.avatarUpdatedAt?.getTime() ?? null,
      collaborators: s.collaborators.map((c) => ({ id: c.user.id, name: c.user.name, avatarVersion: c.user.avatarUpdatedAt?.getTime() ?? null })),
      contestId: s.contestId,
      ...(s.result as unknown as Record<MetricKey, number> & { weightedError: number; complexity: number; complexityUncertainty: number; maxError: number; evaluatorVersion: string }),
    }));
}

export async function getSubmissionDetail(id: string) {
  return db.submission.findUnique({
    where: { id },
    include: {
      user: { select: { id: true, name: true, affiliation: true, avatarUpdatedAt: true } },
      collaborators: { include: { user: { select: { id: true, name: true, affiliation: true, avatarUpdatedAt: true } } }, orderBy: { addedAt: "asc" } },
      result: true,
      job: { select: { log: true, attempts: true, cancelRequestedAt: true } },
      contest: { select: { id: true, slug: true, title: true, status: true } },
    },
  });
}

export function canViewSubmission(sub: { userId: string; isPrivate: boolean; isHidden: boolean; collaborators?: { userId: string }[] }, viewer?: { id: string; role: string } | null) {
  if (viewer?.role === "ADMIN") return true;
  if (viewer?.id === sub.userId) return true;
  if (viewer && sub.collaborators?.some((c) => c.userId === viewer.id)) return true;
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

/** 1-based public rank (lower weighted error is better) among current-benchmark, public, visible, completed submissions; null when the submission itself is not ranked. */
export async function publicRankOf(submissionId: string): Promise<number | null> {
  const me = await db.submission.findUnique({ where: { id: submissionId }, select: { isPrivate: true, isHidden: true, status: true, result: { select: { weightedError: true, evaluatorVersion: true } } } });
  if (!me?.result || me.isPrivate || me.isHidden || me.status !== "COMPLETED" || !isCurrentBenchmark(me.result.evaluatorVersion)) return null;
  const better = await db.submission.count({ where: { isPrivate: false, isHidden: false, status: "COMPLETED", result: { weightedError: { lt: me.result.weightedError }, evaluatorVersion: { startsWith: BENCHMARK_VERSION } } } }); // stamp is "<benchmark>/<runtime>"
  return better + 1;
}
