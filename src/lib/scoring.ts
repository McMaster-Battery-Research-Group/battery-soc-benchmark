import { TEST_CASES, type MetricKey } from "./test-cases";

export type MetricValues = Record<MetricKey, number>;

/**
 * Headline "weighted error": weighted arithmetic mean of the per-test-case
 * average RMSE values (% SOC), using the public weights in TEST_CASES.
 * Challenging / important edge cases (−20 °C, 1000 kg, robustness, sensor
 * offset) are up-weighted as suggested in the ITEC 2022 paper, §IV.c.
 */
export function weightedError(values: Partial<MetricValues>, weights?: Partial<Record<MetricKey, number>>): number {
  let num = 0;
  let den = 0;
  for (const tc of TEST_CASES) {
    const v = values[tc.key];
    if (typeof v !== "number" || Number.isNaN(v)) continue;
    const w = weights?.[tc.key] ?? tc.weight;
    num += v * w;
    den += w;
  }
  return den === 0 ? NaN : round(num / den, 3);
}

export function round(v: number, digits = 3) {
  const f = 10 ** digits;
  return Math.round(v * f) / f;
}

export const TOTAL_WEIGHT = TEST_CASES.reduce((a, t) => a + t.weight, 0);
