import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { METRIC_KEYS, type MetricKey } from "@/lib/test-cases";

/**
 * Score history. Every time a submission's scores are produced or changed —
 * an evaluation attempt (success or failure), a re-run, or a re-score after
 * the weights change — one immutable ScoreRevision row is appended. The
 * EvaluationResult row always holds the *current* numbers; the revisions are
 * the audit trail shown on the submission page and in the PDF.
 */
export type RevisionKind = "evaluation" | "failure" | "rescore" | "reevaluation" | "resubmission" | "edit" | "cancelled";

export interface RevisionInput {
  submissionId: string;
  kind: RevisionKind;
  evaluatorVersion: string;
  /** null for failures */
  weightedError?: number | null;
  complexity?: number | null;
  maxError?: number | null;
  metrics?: Partial<Record<MetricKey, number>> | null;
  /** human note: admin reason, weight-change description, failure message */
  note?: string | null;
  /** who/what triggered it: worker id, "scripts/rescore.ts", admin user id */
  by?: string | null;
}

export async function recordRevision(input: RevisionInput) {
  const metrics = input.metrics ? (Object.fromEntries(METRIC_KEYS.filter((k) => typeof input.metrics![k] === "number").map((k) => [k, input.metrics![k]])) as Prisma.InputJsonObject) : undefined;
  return db.scoreRevision.create({
    data: {
      submissionId: input.submissionId,
      kind: input.kind,
      evaluatorVersion: input.evaluatorVersion,
      weightedError: input.weightedError ?? null,
      complexity: input.complexity ?? null,
      maxError: input.maxError ?? null,
      metrics,
      note: input.note ?? null,
      by: input.by ?? null,
    },
  });
}

export function getHistory(submissionId: string) {
  return db.scoreRevision.findMany({ where: { submissionId }, orderBy: { createdAt: "asc" } });
}

export const KIND_LABEL: Record<RevisionKind, string> = {
  evaluation: "Evaluated",
  failure: "Evaluation failed",
  rescore: "Re-scored (weights changed)",
  reevaluation: "Re-evaluated",
  resubmission: "New package uploaded",
  edit: "Details edited",
  cancelled: "Evaluation cancelled",
};
