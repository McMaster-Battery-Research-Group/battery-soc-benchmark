import { TEST_CASES, type MetricKey } from "@/lib/test-cases";

/**
 * Where the weighted error comes from: the test cases grouped the way the Methodology page groups
 * them, each with its weight × RMSE contribution and its share of the score. Shared by the
 * results-page donut and the PDF report so both tell the same story.
 */
export const SCORE_GROUPS = [
  { key: "accuracy", label: "Accuracy on blinded cycles", short: "Accuracy", tests: [2, 3], color: "#8f2555" },
  { key: "conditions", label: "Operating conditions", short: "Conditions", tests: [4, 5, 6, 7, 8], color: "#1f7fb5" },
  { key: "temperature", label: "Ambient temperature", short: "Temperature", tests: [9], color: "#c98a2e" },
  { key: "robustness", label: "Robustness", short: "Robustness", tests: [10, 11], color: "#6b62b8" },
] as const;

export type ScoreShare = (typeof SCORE_GROUPS)[number] & {
  /** sum of weight × RMSE over the group's tests */
  part: number;
  /** 0–1 share of the weighted error */
  share: number;
  /** the tests behind the number, largest contribution first */
  items: { test: number; label: string; short: string; rmse: number; part: number }[];
};

export function scoreShares(values: Record<MetricKey, number>, weights?: Partial<Record<MetricKey, number>>): ScoreShare[] {
  const groups = SCORE_GROUPS.map((g) => {
    const items = TEST_CASES.filter((t) => (g.tests as readonly number[]).includes(t.test))
      .map((t) => {
        const rmse = values[t.key];
        const w = weights?.[t.key] ?? t.weight;
        return { test: t.test, label: t.label, short: t.short, rmse, part: Number.isFinite(rmse) ? w * rmse : 0 };
      })
      .sort((a, b) => b.part - a.part);
    return { ...g, items, part: items.reduce((s, i) => s + i.part, 0), share: 0 };
  });
  const total = groups.reduce((s, g) => s + g.part, 0) || 1;
  return groups.map((g) => ({ ...g, share: g.part / total }));
}
