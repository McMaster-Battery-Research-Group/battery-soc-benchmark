import type { TimeSeriesTrace } from "@/evaluator/types";

/**
 * Results evaluated before 2026-10-21 stored the label "Wrong initial SOC …"; the site says
 * "incorrect" everywhere now (tracker 2026-10-14 #18). Applied wherever stored traces are read, so
 * the old rows read the same as new ones without rewriting the JSON in the database.
 */
export function normalizeTraces<T extends { label: string }>(list: T[]): T[] {
  const old = "Wrong initial SOC";
  return list.map((t) => (t.label.startsWith(old) ? { ...t, label: "Incorrect initial SOC" + t.label.slice(old.length) } : t));
}

/** The one trace the evaluator adds per model for its own largest instantaneous error (key "worst-…", pipeline.py). */
export const isWorstCase = (t: { key: string }) => t.key.startsWith("worst-");

/** Two traces describe the same evaluation run: same cell, cycle family and chamber temperature. */
export const sameRun = (a: Pick<TimeSeriesTrace, "cell" | "cycle" | "temperatureC">, b: Pick<TimeSeriesTrace, "cell" | "cycle" | "temperatureC">) =>
  a.cell === b.cell && a.cycle === b.cycle && a.temperatureC === b.temperatureC;

/** Estimation error (estimated − actual) in % SOC per sample; a blinded trace carries it directly. */
export function errorOf(t: TimeSeriesTrace): number[] {
  if (t.error) return t.error;
  if (t.actual && t.estimated) {
    const a = t.actual;
    return t.estimated.map((e, i) => Math.round(100 * (e - a[i])) / 100);
  }
  return [];
}

/**
 * Peak-preserving down-sampling for display, the same rule as display_indices() in pipeline.py:
 * split the run into points/2 buckets and keep the sample with the largest and the smallest signed
 * error in each, plus both ends, so every spike survives at chart resolution.
 */
export function displayIndices(actual: ArrayLike<number>, pred: ArrayLike<number>, points = 240): number[] {
  const n = actual.length;
  if (n <= points) return Array.from({ length: n }, (_, i) => i);
  const buckets = Math.floor(points / 2);
  const keep = new Set<number>([0, n - 1]);
  for (let b = 0; b < buckets; b++) {
    const a = Math.floor((b * n) / buckets);
    const e = Math.floor(((b + 1) * n) / buckets);
    if (e <= a) continue;
    let imax = a, imin = a, vmax = -Infinity, vmin = Infinity;
    for (let i = a; i < e; i++) {
      const err = pred[i] - actual[i];
      if (err > vmax) { vmax = err; imax = i; }
      if (err < vmin) { vmin = err; imin = i; }
    }
    keep.add(imax);
    keep.add(imin);
  }
  return Array.from(keep).sort((x, y) => x - y);
}
