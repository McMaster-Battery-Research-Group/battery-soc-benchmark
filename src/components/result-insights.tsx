import { Lightbulb, TrendingDown, TrendingUp, ThermometerSnowflake, BatteryCharging, Crosshair, Activity, Scale } from "lucide-react";
import { TEST_CASES, type MetricKey } from "@/lib/test-cases";
import { fmtPct } from "@/lib/utils";

type Insight = { icon: React.ComponentType<{ className?: string }>; tone: "good" | "warn" | "info"; title: string; text: string };

/**
 * Plain-language reading of a result, derived from the numbers with simple rules: the three things a
 * supervisor would say out loud when shown the scorecard. Every figure is checkable against the
 * scorecard. Thresholds are heuristics; they only pick which sentences to show, never a score.
 */
function buildInsights(v: Record<MetricKey, number>, weights: Partial<Record<MetricKey, number>>): Insight[] {
  const out: Insight[] = [];
  const w = (k: MetricKey) => weights[k] ?? TEST_CASES.find((t) => t.key === k)!.weight;
  const vs = (a: number, b: number) => `${fmtPct(a)} % vs ${fmtPct(b)} %`;

  // what dominates the score
  const parts = TEST_CASES.map((t) => ({ t, part: w(t.key) * v[t.key] })).filter((x) => x.part > 0).sort((a, b) => b.part - a.part);
  const total = parts.reduce((s, x) => s + x.part, 0) || 1;
  const top = parts.slice(0, 2).filter((x) => x.part / total > 0.15);
  if (top.length) {
    const share = Math.round((100 * top.reduce((s, x) => s + x.part, 0)) / total);
    out.push({ icon: Scale, tone: "info", title: `${top.map((x) => x.t.label).join(" and ")} drive${top.length === 1 ? "s" : ""} the score`, text: `${share} % of the weighted error comes from ${top.map((x) => `T${x.t.test} (${fmtPct(v[x.t.key])} %)`).join(" and ")}. Improving there moves the rank most.` });
  }

  // generalisation: blinded vs open cells
  const ratioBlind = v.blindedCell / Math.max(v.nonBlindedCells, 0.01);
  if (ratioBlind > 1.3) out.push({ icon: Crosshair, tone: "warn", title: `${ratioBlind.toFixed(1)}× worse on the blinded cell`, text: `${vs(v.blindedCell, v.nonBlindedCells)} on the open cells: the model leans on the released data.` });
  else out.push({ icon: Crosshair, tone: "good", title: "Generalises to the blinded cell", text: `${vs(v.blindedCell, v.nonBlindedCells)} on the open cells: it learned the chemistry, not the files.` });

  // temperature
  const cold = v.tempM20, warm = v.temp25;
  if (cold / Math.max(warm, 0.01) > 1.7) out.push({ icon: ThermometerSnowflake, tone: "warn", title: "Cold is the weak spot", text: `${fmtPct(cold)} % at −20 °C against ${fmtPct(warm)} % at 25 °C. Below zero the resistance rises and the voltage curve distorts.` });
  else out.push({ icon: ThermometerSnowflake, tone: "good", title: "Temperature handled well", text: `${fmtPct(cold)} % at −20 °C vs ${fmtPct(warm)} % at 25 °C.` });

  // charging
  if (v.charging / Math.max(v.allCells, 0.01) > 2.5) out.push({ icon: BatteryCharging, tone: "warn", title: "Charging is much worse than driving", text: `${vs(v.charging, v.allCells)} overall: typical of estimators tuned only on discharge.` });

  // robustness: wrong initial SOC
  const r10 = v.initialSocError / Math.max(v.allCells, 0.01);
  if (r10 > 3) out.push({ icon: TrendingDown, tone: "warn", title: "Does not recover from a wrong start", text: `${fmtPct(v.initialSocError)} % on test 10. Pure current integration cannot correct a bad initial SOC; voltage feedback fixes this.` });
  else if (r10 < 1.8) out.push({ icon: TrendingUp, tone: "good", title: "Recovers from a wrong start", text: `${fmtPct(v.initialSocError)} % on test 10: the estimator pulls itself back using voltage.` });

  // robustness: sensor bias
  const r11 = v.currentSensorOffset / Math.max(v.allCells, 0.01);
  if (r11 > 3) out.push({ icon: Activity, tone: "warn", title: "A biased current sensor hurts", text: `${fmtPct(v.currentSensorOffset)} % on test 11: the drift is integrated instead of corrected.` });
  else if (r11 < 1.8) out.push({ icon: Activity, tone: "good", title: "Tolerates a biased current sensor", text: `${fmtPct(v.currentSensorOffset)} % on test 11: the bias is being corrected away.` });

  // three at most: problems first, then what drives the score, then strengths
  const order = { warn: 0, info: 1, good: 2 };
  return out.sort((a, b) => order[a.tone] - order[b.tone]).slice(0, 3);
}

export function ResultInsights({ values, weights }: { values: Record<MetricKey, number>; weights: Partial<Record<MetricKey, number>> }) {
  const insights = buildInsights(values, weights);
  if (!insights.length) return null;
  const tone = {
    good: { bar: "border-l-forest", icon: "bg-[#e4f1ea] text-forest" },
    warn: { bar: "border-l-[#d9a84a]", icon: "bg-[#fdf4e3] text-[#9a6a17]" },
    info: { bar: "border-l-maroon", icon: "bg-maroon-100 text-maroon" },
  } as const;
  return (
    <section aria-labelledby="takeaways">
      <div className="mb-2 flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:gap-2">
        <h2 id="takeaways" className="flex items-center gap-2 font-heading text-lg font-semibold text-ink"><Lightbulb className="size-5 text-maroon" /> Takeaways</h2>
        <p className="text-xs text-grey-600">Read from the scorecard; every figure is in the table.</p>
      </div>
      <ul className="grid gap-3 md:grid-cols-3">
        {insights.map((i) => (
          <li key={i.title} className={`card flex items-start gap-3 border-l-4 p-4 ${tone[i.tone].bar}`}>
            <span className={`mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full ${tone[i.tone].icon}`}><i.icon className="size-4" /></span>
            <div className="min-w-0">
              <p className="font-heading text-[0.9375rem] font-semibold leading-snug text-ink">{i.title}</p>
              <p className="mt-1 text-sm leading-relaxed text-grey-700">{i.text}</p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
