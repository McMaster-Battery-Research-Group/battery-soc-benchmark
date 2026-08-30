import { TEST_CASES, COMPLEXITY_LABELS, type MetricKey } from "@/lib/test-cases";
import { fmtPct } from "@/lib/utils";
import { Term } from "@/components/term";

/**
 * The one table that explains the score: every test case with its RMSE, the weight it carries and its
 * contribution, summing to the headline weighted error — so a reader can verify the number by hand.
 * Groups follow the Methodology page: accuracy (1–3), conditions (4–9), robustness (10–11).
 */
export function Scorecard({ values, weights, weightedError, complexity, complexityUncertainty, maxError, worstCase }: {
  values: Record<MetricKey, number>;
  weights: Partial<Record<MetricKey, number>>;
  weightedError: number;
  complexity: number;
  complexityUncertainty: number;
  maxError: number;
  /** where the max error occurred (from the per-cycle rows) */
  worstCase?: string;
}) {
  const rows = TEST_CASES.map((t) => {
    const w = weights[t.key] ?? t.weight;
    return { ...t, value: values[t.key], w, part: w * values[t.key] };
  });
  const sum = rows.reduce((s, r) => s + r.part, 0);
  const maxRmse = Math.max(...rows.map((r) => r.value), 0.001);
  const group = (test: number) => (test <= 3 ? "Estimation accuracy" : test <= 9 ? "Operating conditions" : "Robustness");
  let lastGroup = "";
  return (
    <section className="card overflow-hidden">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-border px-5 py-4">
        <div>
          <h2 className="font-heading text-lg font-semibold text-ink">Scorecard</h2>
          <p className="text-sm text-grey-700">Average RMSE (% SOC) per test case, weighted into the leaderboard score. Lower is better.</p>
        </div>
        <div className="text-right">
          <p className="font-heading text-xs font-semibold uppercase tracking-wide text-grey-600"><Term k="weighted-error">Weighted error</Term></p>
          <p className="font-heading text-3xl font-bold tabular text-ink">{fmtPct(weightedError)}<span className="text-lg text-grey-600"> %</span></p>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-grey-100 text-left font-heading text-xs uppercase tracking-wide text-grey-700">
            <tr>
              <th className="px-5 py-2">Test case</th>
              <th className="px-3 py-2 text-right">RMSE</th>
              <th className="w-[26%] px-3 py-2">Relative</th>
              <th className="px-3 py-2 text-right">Weight</th>
              <th className="px-5 py-2 text-right">Weight × RMSE</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const g = group(r.test);
              const head = g !== lastGroup;
              lastGroup = g;
              return (
                <tr key={r.key} className={`border-t border-border ${r.w === 0 ? "text-grey-500" : ""}`}>
                  <td className="px-5 py-2">
                    {head ? <span className="mb-0.5 block font-heading text-[10px] font-semibold uppercase tracking-wide text-maroon">{g}</span> : null}
                    <span className="mr-1.5 text-xs text-grey-500">T{r.test}</span>
                    <span className={r.w === 0 ? "" : "text-grey-900"}>{r.label}</span>
                    {r.w === 0 ? <span className="ml-1.5 text-xs text-grey-500">(reference only — every other test is a subset of it)</span> : null}
                  </td>
                  <td className="px-3 py-2 text-right font-heading font-semibold tabular text-ink">{fmtPct(r.value)} %</td>
                  <td className="px-3 py-2">
                    <div className="h-2 w-full rounded-full bg-grey-100"><div className="h-2 rounded-full bg-maroon/70" style={{ width: `${Math.max(2, (100 * r.value) / maxRmse)}%` }} /></div>
                  </td>
                  <td className="px-3 py-2 text-right tabular text-grey-700">{r.w.toFixed(4)}</td>
                  <td className="px-5 py-2 text-right tabular text-ink">{r.part.toFixed(4)}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-border bg-grey-100/60 font-heading font-semibold text-ink">
              <td className="px-5 py-2.5" colSpan={4}>Weighted error = Σ (weight × RMSE)</td>
              <td className="px-5 py-2.5 text-right tabular">{fmtPct(sum)} %</td>
            </tr>
          </tfoot>
        </table>
      </div>
      <div className="flex flex-wrap gap-x-8 gap-y-1 border-t border-border px-5 py-3 text-sm text-grey-700">
        <span><span className="font-heading font-medium text-ink">Max error</span> {fmtPct(maxError, 1)} % — largest instantaneous |estimate − truth| over every blinded cycle{worstCase ? <> (on {worstCase} — plotted under Key cases for new evaluations)</> : null}; not scored</span>
        <span><span className="font-heading font-medium text-ink"><Term k="complexity">Complexity</Term></span> {complexity} ±{complexityUncertainty} · {COMPLEXITY_LABELS[complexity]} (informational, not scored)</span>
        {Math.abs(sum - weightedError) > 0.002 ? <span className="text-[#9a6a17]">The stored score ({fmtPct(weightedError)} %) differs from today&apos;s weights — see Score history.</span> : null}
      </div>
    </section>
  );
}
