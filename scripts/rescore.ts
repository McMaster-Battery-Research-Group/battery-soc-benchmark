/**
 * Recompute every stored weighted error from the 18 stored per-test values
 * using the CURRENT weights in src/lib/test-cases.ts, record a ScoreRevision
 * for every change, and (optionally) e-mail the authors a fresh PDF.
 *
 *   npx tsx scripts/rescore.ts                                   # dry run: shows what would change
 *   npx tsx scripts/rescore.ts --apply --note "Weights updated per lab decision 2026-09-01"
 *   npx tsx scripts/rescore.ts --apply --notify --note "…"       # also e-mail owner + accepted collaborators with the new PDF
 *
 * Use this when ONLY the weights change (a scoring-policy decision). If the
 * metrics, data, padding or sweeps change, old results cannot be recomputed —
 * bump BENCHMARK_VERSION instead so they show as "legacy scoring".
 * Runs against whatever DATABASE_URL is in the environment (.env by default;
 * `node --env-file=.env.production --import tsx scripts/rescore.ts …` for production).
 */
import "dotenv/config";
import { db } from "@/lib/db";
import { weightedError } from "@/lib/scoring";
import { METRIC_KEYS, type MetricKey } from "@/lib/test-cases";
import { recordRevision, getHistory } from "@/lib/history";
import { buildSubmissionReport, type ReportInput } from "@/lib/report";
import { rescoreEmail } from "@/lib/mail";

function arg(name: string) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const apply = process.argv.includes("--apply");
  const notify = process.argv.includes("--notify");
  const note = arg("--note") ?? "Scoring weights updated";
  if (apply && !arg("--note")) console.warn("No --note given; the revision will say \"Scoring weights updated\". A specific reason is better for authors.");

  const results = await db.evaluationResult.findMany({
    include: { submission: { include: { user: true, collaborators: { where: { acceptedAt: { not: null } }, include: { user: { select: { email: true, name: true, affiliation: true } } } } } } },
  });
  let changed = 0;
  for (const r of results) {
    const values = Object.fromEntries(METRIC_KEYS.map((k) => [k, (r as unknown as Record<MetricKey, number>)[k]])) as Record<MetricKey, number>;
    const fresh = weightedError(values);
    if (Math.abs(fresh - r.weightedError) <= 0.0005) continue;
    changed++;
    const s = r.submission;
    console.log(`#${s.seq} ${s.modelName}: ${r.weightedError} → ${fresh}`);
    if (!apply) continue;

    await db.evaluationResult.update({ where: { id: r.id }, data: { weightedError: fresh } });
    await recordRevision({ submissionId: s.id, kind: "rescore", evaluatorVersion: r.evaluatorVersion, weightedError: fresh, complexity: r.complexity, maxError: r.maxError, metrics: values, note, by: "scripts/rescore.ts" });

    if (notify) {
      const freshResult = await db.evaluationResult.findUnique({ where: { id: r.id } });
      const history = await getHistory(s.id);
      let report: Buffer | undefined;
      try {
        report = await buildSubmissionReport({ submission: s, user: s.user, collaborators: s.collaborators.map((c) => c.user), result: freshResult as unknown as ReportInput["result"], history, siteUrl: process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000" });
      } catch (e) {
        console.warn(`  PDF failed for #${s.seq}: ${e instanceof Error ? e.message : e}`);
      }
      for (const p of [{ email: s.user.email, name: s.user.name }, ...s.collaborators.map((c) => c.user)]) {
        const ok = await rescoreEmail(p.email, p.name, s.modelName, s.id, r.weightedError, fresh, note, report);
        console.log(`  ${ok ? "e-mailed" : "E-MAIL FAILED"} ${p.email}`);
      }
    }
  }
  console.log(`${results.length} results checked, ${changed} ${apply ? "updated" : "would change (re-run with --apply)"}${apply && !notify && changed ? " — authors NOT notified (add --notify)" : ""}`);
  await db.$disconnect();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
