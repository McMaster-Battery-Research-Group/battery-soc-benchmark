/**
 * Recompute every stored weighted error from the 18 stored per-test values
 * using the CURRENT weights in src/lib/test-cases.ts.
 *
 *   npx tsx scripts/rescore.ts            # dry run: shows what would change
 *   npx tsx scripts/rescore.ts --apply    # writes the new values
 *
 * Use this when ONLY the weights change (a scoring-policy decision). If the
 * metrics, data, padding or sweeps change, old results cannot be recomputed —
 * bump BENCHMARK_VERSION instead so they show as "legacy scoring".
 * Runs against whatever DATABASE_URL is in the environment (.env by default;
 * `node --env-file=.env.production --import tsx scripts/rescore.ts` for production).
 */
import "dotenv/config";
import { db } from "@/lib/db";
import { weightedError } from "@/lib/scoring";
import { METRIC_KEYS, type MetricKey } from "@/lib/test-cases";

async function main() {
  const apply = process.argv.includes("--apply");
  const results = await db.evaluationResult.findMany({ include: { submission: { select: { seq: true, modelName: true } } } });
  let changed = 0;
  for (const r of results) {
    const values = Object.fromEntries(METRIC_KEYS.map((k) => [k, (r as unknown as Record<MetricKey, number>)[k]])) as Record<MetricKey, number>;
    const fresh = weightedError(values);
    if (Math.abs(fresh - r.weightedError) > 0.0005) {
      changed++;
      console.log(`#${r.submission.seq} ${r.submission.modelName}: ${r.weightedError} → ${fresh}`);
      if (apply) await db.evaluationResult.update({ where: { id: r.id }, data: { weightedError: fresh } });
    }
  }
  console.log(`${results.length} results checked, ${changed} ${apply ? "updated" : "would change (re-run with --apply)"}`);
  await db.$disconnect();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
