import { db } from "@/lib/db";
import { weightedError } from "@/lib/scoring";
import { METRIC_KEYS, type MetricKey } from "@/lib/test-cases";
import { recordRevision, getHistory } from "@/lib/history";
import { buildSubmissionReport, type ReportInput } from "@/lib/report";
import { rescoreEmail } from "@/lib/mail";
import { getActiveWeights, type Weights } from "@/lib/scoring-config";

/**
 * Recompute every stored weighted error from the 18 stored per-test values
 * with the given (or active) weights. Records a ScoreRevision for every change
 * and, if `notify`, e-mails owner + accepted collaborators with a fresh PDF.
 * Used by /admin/scoring and scripts/rescore.ts.
 */
export async function rescoreAll(opts: { apply: boolean; notify: boolean; note: string; by: string; weights?: Weights; log?: (line: string) => void }) {
  const weights = opts.weights ?? (await getActiveWeights());
  const log = opts.log ?? (() => {});
  const results = await db.evaluationResult.findMany({
    include: { submission: { include: { user: true, collaborators: { where: { acceptedAt: { not: null } }, include: { user: { select: { email: true, name: true, affiliation: true } } } } } } },
  });
  let changed = 0, emailed = 0;
  const changes: { seq: number; modelName: string; from: number; to: number }[] = [];
  for (const r of results) {
    const values = Object.fromEntries(METRIC_KEYS.map((k) => [k, (r as unknown as Record<MetricKey, number>)[k]])) as Record<MetricKey, number>;
    const fresh = weightedError(values, weights);
    if (Math.abs(fresh - r.weightedError) <= 0.0005) continue;
    changed++;
    const s = r.submission;
    changes.push({ seq: s.seq, modelName: s.modelName, from: r.weightedError, to: fresh });
    log(`#${s.seq} ${s.modelName}: ${r.weightedError} → ${fresh}`);
    if (!opts.apply) continue;

    await db.evaluationResult.update({ where: { id: r.id }, data: { weightedError: fresh } });
    await recordRevision({ submissionId: s.id, kind: "rescore", evaluatorVersion: r.evaluatorVersion, weightedError: fresh, complexity: r.complexity, maxError: r.maxError, metrics: values, note: opts.note, by: opts.by });

    if (opts.notify) {
      const freshResult = await db.evaluationResult.findUnique({ where: { id: r.id } });
      let report: Buffer | undefined;
      try {
        report = await buildSubmissionReport({ submission: s, user: s.user, collaborators: s.collaborators.map((c) => c.user), result: freshResult as unknown as ReportInput["result"], history: await getHistory(s.id), weights, siteUrl: process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000" });
      } catch (e) {
        log(`  PDF failed for #${s.seq}: ${e instanceof Error ? e.message : e}`);
      }
      for (const p of [{ email: s.user.email, name: s.user.name }, ...s.collaborators.map((c) => c.user)]) {
        const ok = await rescoreEmail(p.email, p.name, s.modelName, s.id, r.weightedError, fresh, opts.note, report);
        if (ok) emailed++;
        log(`  ${ok ? "e-mailed" : "E-MAIL FAILED"} ${p.email}`);
      }
    }
  }
  return { checked: results.length, changed, emailed, changes };
}
