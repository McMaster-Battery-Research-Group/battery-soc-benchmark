/**
 * Which version of the benchmark produced a stored result.
 *
 * The evaluator stamps every result with `socbench-eval-<version>/<runtime>`
 * (e.g. "socbench-eval-0.1.0/python"); the runtime suffix is informational —
 * Python and MATLAB packages are scored identically. Bump the version in
 * evaluator/python/socbench_eval/__init__.py (and here) whenever the scoring
 * *changes meaning*: different data, metrics, padding, sweeps or weights.
 *
 * Results from an older version stay on the leaderboard but are marked
 * "legacy scoring" so they are not read as directly comparable. If ONLY the
 * weights change, `scripts/rescore.ts` recomputes weighted errors from the
 * stored per-test values without re-running anything; anything deeper needs a
 * re-submission because packages are deleted after evaluation.
 */
export const BENCHMARK_VERSION = "socbench-eval-0.1.0";
/** Full stamp of the current evaluator for display (runtime omitted). */
export const CURRENT_EVALUATOR_VERSION = BENCHMARK_VERSION;

export function benchmarkOf(evaluatorVersion: string | null | undefined): string {
  return (evaluatorVersion ?? "unknown").split("/")[0];
}

export function isCurrentBenchmark(evaluatorVersion: string | null | undefined): boolean {
  return benchmarkOf(evaluatorVersion) === BENCHMARK_VERSION;
}
