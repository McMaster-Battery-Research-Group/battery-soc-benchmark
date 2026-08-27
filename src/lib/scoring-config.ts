import { db } from "@/lib/db";
import { TEST_CASES, METRIC_KEYS, type MetricKey } from "@/lib/test-cases";

/**
 * Active scoring weights. Defaults come from TEST_CASES (the published V2
 * weights); administrators can override them from /admin/scoring, which stores
 * a new ScoringConfig row (append-only — the latest is active) and re-scores
 * every stored result. Everything that shows or computes the weighted error
 * reads from here so the site, the worker, the PDF and the docs agree.
 */
export type Weights = Record<MetricKey, number>;

export const DEFAULT_WEIGHTS: Weights = Object.fromEntries(TEST_CASES.map((t) => [t.key, t.weight])) as Weights;

export type ActiveScoring = { weights: Weights; isDefault: boolean; id: string | null; note: string | null; updatedAt: Date | null; updatedBy: string | null };

let cache: { at: number; value: ActiveScoring } | null = null;

/** Latest config row, or the defaults. Cached for 30 s per process. */
export async function getActiveScoring(fresh = false): Promise<ActiveScoring> {
  if (!fresh && cache && Date.now() - cache.at < 30_000) return cache.value;
  const row = await db.scoringConfig.findFirst({ orderBy: { createdAt: "desc" } }).catch(() => null);
  const value: ActiveScoring = row
    ? { weights: normalise(row.weights as Record<string, number>), isDefault: sameWeights(normalise(row.weights as Record<string, number>), DEFAULT_WEIGHTS), id: row.id, note: row.note, updatedAt: row.createdAt, updatedBy: row.createdBy }
    : { weights: DEFAULT_WEIGHTS, isDefault: true, id: null, note: null, updatedAt: null, updatedBy: null };
  cache = { at: Date.now(), value };
  return value;
}

export async function getActiveWeights(): Promise<Weights> {
  return (await getActiveScoring()).weights;
}

export function normalise(w: Record<string, number>): Weights {
  return Object.fromEntries(METRIC_KEYS.map((k) => [k, Number.isFinite(Number(w[k])) ? Number(w[k]) : DEFAULT_WEIGHTS[k]])) as Weights;
}

export function sameWeights(a: Weights, b: Weights) {
  return METRIC_KEYS.every((k) => Math.abs(a[k] - b[k]) < 1e-9);
}

export function sumWeights(w: Weights) {
  return METRIC_KEYS.reduce((s, k) => s + w[k], 0);
}

/** Validation for admin input: non-negative, finite, sum to 1 (±0.001). Returns a problem or null. */
export function validateWeights(w: Weights): string | null {
  for (const k of METRIC_KEYS) if (!Number.isFinite(w[k]) || w[k] < 0) return `Weight for "${k}" must be a number ≥ 0.`;
  const s = sumWeights(w);
  if (Math.abs(s - 1) > 0.001) return `Weights must sum to 1 (currently ${s.toFixed(4)}).`;
  return null;
}
