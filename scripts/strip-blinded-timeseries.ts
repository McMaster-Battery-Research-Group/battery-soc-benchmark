/**
 * Strip the blinded cell's reference SOC from stored on-page traces (timeSeries).
 *
 * Results evaluated before the blinded-cell fix stored the m448 `actual` (and `estimated`)
 * curve in EvaluationResult.timeSeries, down-sampled to ~240 points. The results page is
 * public, so that curve — the benchmark's answer key — is visible on existing public
 * submissions until they are re-evaluated. This rewrites those rows in place to match what
 * the evaluator now emits: a blinded trace keeps only `error` (estimated − actual) and drops
 * `actual`/`estimated`. Non-blinded traces are untouched. No re-evaluation, no score change.
 *
 *   npx tsx scripts/strip-blinded-timeseries.ts            # dry run: list affected results
 *   npx tsx scripts/strip-blinded-timeseries.ts --apply    # rewrite the rows
 *   (on the worker: sudo -u socbench bash -c 'cd /opt/socbench && set -a && . /etc/socbench/worker.env && set +a && node --import tsx scripts/strip-blinded-timeseries.ts --apply')
 *
 * Idempotent: a trace already stripped (blinded + error, no actual) is left as is.
 */
import "dotenv/config";
import { db } from "@/lib/db";

const BLINDED_CELLS = new Set(["m448"]);

type Trace = {
  cell?: string;
  blinded?: boolean;
  actual?: number[];
  estimated?: number[];
  error?: number[];
  [k: string]: unknown;
};

/** Returns the rewritten trace, or null if unchanged. */
function stripTrace(t: Trace): Trace | null {
  if (!t || !BLINDED_CELLS.has(t.cell ?? "")) return null;
  const hasRef = Array.isArray(t.actual) || Array.isArray(t.estimated);
  if (!hasRef) return null; // already stripped
  const est = t.estimated ?? [];
  const act = t.actual ?? [];
  const error = Array.isArray(t.error)
    ? t.error
    : est.map((e, i) => Math.round((e - (act[i] ?? 0)) * 100) / 100);
  const { actual: _a, estimated: _e, ...rest } = t;
  return { ...rest, blinded: true, error };
}

async function main() {
  const apply = process.argv.includes("--apply");
  const rows = await db.evaluationResult.findMany({
    select: { submissionId: true, timeSeries: true, submission: { select: { seq: true, modelName: true, isPrivate: true, isHidden: true } } },
    orderBy: { submission: { seq: "asc" } },
  });

  let affected = 0, tracesStripped = 0;
  for (const r of rows) {
    const ts = (r.timeSeries ?? []) as Trace[];
    if (!Array.isArray(ts) || !ts.length) continue;
    let changed = false;
    const next = ts.map((t) => {
      const s = stripTrace(t);
      if (s) { changed = true; tracesStripped++; }
      return s ?? t;
    });
    if (!changed) continue;
    affected++;
    const s = r.submission;
    const vis = s?.isPrivate ? "private" : s?.isHidden ? "hidden" : "PUBLIC";
    const n = next.filter((t) => (t as Trace).blinded).length;
    console.log(`  ${apply ? "stripped" : "would strip"} #${s?.seq ?? "?"} ${vis.padEnd(7)} ${n} m448 trace(s) — ${s?.modelName ?? r.submissionId}`);
    if (apply) {
      await db.evaluationResult.update({ where: { submissionId: r.submissionId }, data: { timeSeries: next as object } });
    }
  }

  if (!affected) {
    console.log("No stored timeSeries still contain the blinded cell's reference SOC — nothing to do.");
    return;
  }
  console.log(`\n${apply ? "Done" : "Dry run"}: ${affected} result(s), ${tracesStripped} blinded trace(s)${apply ? " rewritten." : " would be rewritten."}`);
  if (!apply) console.log("Re-run with --apply to rewrite the rows.");
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
