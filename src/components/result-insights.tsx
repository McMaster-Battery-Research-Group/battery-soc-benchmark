import { Lightbulb, TrendingDown, TrendingUp, ThermometerSnowflake, BatteryCharging, Crosshair, Activity, Scale } from "lucide-react";
import { TEST_CASES, type MetricKey } from "@/lib/test-cases";
import { fmtPct } from "@/lib/utils";

type Insight = { icon: React.ComponentType<{ className?: string }>; tone: "good" | "warn" | "info"; text: string };

/**
 * Plain-language reading of a result, derived from the numbers with simple rules — the paragraph a
 * supervisor would say out loud when shown the scorecard. Every statement is checkable against the
 * table below it. Thresholds are heuristics; they only pick which sentences to show, never a score.
 */
function buildInsights(v: Record<MetricKey, number>, weights: Partial<Record<MetricKey, number>>): Insight[] {
  const out: Insight[] = [];
  const w = (k: MetricKey) => weights[k] ?? TEST_CASES.find((t) => t.key === k)!.weight;

  // 1. what dominates the score
  const parts = TEST_CASES.map((t) => ({ t, part: w(t.key) * v[t.key] })).filter((x) => x.part > 0).sort((a, b) => b.part - a.part);
  const total = parts.reduce((s, x) => s + x.part, 0) || 1;
  const top = parts.slice(0, 2).filter((x) => x.part / total > 0.15);
  if (top.length) {
    out.push({
      icon: Scale, tone: "info",
      text: `${Math.round((100 * top.reduce((s, x) => s + x.part, 0)) / total)} % of the score comes from ${top.map((x) => `${x.t.label.toLowerCase()} (T${x.t.test}, ${fmtPct(x.t.key in v ? v[x.t.key] : 0)} % × weight ${w(x.t.key).toFixed(3)})`).join(" and ")} — improving there moves the leaderboard position most.`,
    });
  }

  // 2. generalisation: blinded vs non-blinded cell
  const ratioBlind = v.blindedCell / Math.max(v.nonBlindedCells, 0.01);
  if (ratioBlind > 1.3) out.push({ icon: Crosshair, tone: "warn", text: `The never-released cell is ${ratioBlind.toFixed(1)}× worse than the cells with open data (${fmtPct(v.blindedCell)} % vs ${fmtPct(v.nonBlindedCells)} %) — a sign the model is tuned to the open cells rather than the chemistry.` });
  else out.push({ icon: Crosshair, tone: "good", text: `Accuracy holds on the never-released cell (${fmtPct(v.blindedCell)} % vs ${fmtPct(v.nonBlindedCells)} % on the open cells) — the model generalises rather than memorising the released data.` });

  // 3. temperature
  const cold = v.tempM20, warm = v.temp25;
  if (cold / Math.max(warm, 0.01) > 1.7) out.push({ icon: ThermometerSnowflake, tone: "warn", text: `Cold is the weak spot: ${fmtPct(cold)} % at −20 °C against ${fmtPct(warm)} % at 25 °C. Below zero the cell's resistance rises and the voltage curve distorts; models without temperature awareness lose the most here.` });
  else out.push({ icon: ThermometerSnowflake, tone: "good", text: `Temperature is handled well — ${fmtPct(cold)} % at −20 °C vs ${fmtPct(warm)} % at 25 °C.` });

  // 4. charging
  if (v.charging / Math.max(v.allCells, 0.01) > 2.5) out.push({ icon: BatteryCharging, tone: "warn", text: `Charging is much worse than driving (${fmtPct(v.charging)} % vs ${fmtPct(v.allCells)} % overall) — typical of estimators tuned only on discharge behaviour.` });

  // 5. robustness: wrong initial SOC
  if (v.initialSocError / Math.max(v.allCells, 0.01) > 3) out.push({ icon: TrendingDown, tone: "warn", text: `A wrong initial SOC is not corrected: ${fmtPct(v.initialSocError)} % on test 10. Pure current integration can never recover from a bad start; voltage feedback is what fixes this.` });
  else if (v.initialSocError / Math.max(v.allCells, 0.01) < 1.8) out.push({ icon: TrendingUp, tone: "good", text: `Recovers from a wrong initial SOC (${fmtPct(v.initialSocError)} % on test 10) — the estimator pulls itself back using voltage rather than trusting its starting point.` });

  // 6. robustness: sensor bias
  if (v.currentSensorOffset / Math.max(v.allCells, 0.01) > 3) out.push({ icon: Activity, tone: "warn", text: `A ±0.3 A current-sensor bias hurts badly (${fmtPct(v.currentSensorOffset)} % on test 11): integrated current drifts without bound unless the model corrects against voltage.` });
  else if (v.currentSensorOffset / Math.max(v.allCells, 0.01) < 1.8) out.push({ icon: Activity, tone: "good", text: `Tolerates a biased current sensor (${fmtPct(v.currentSensorOffset)} % on test 11) — the drift a bias causes is being corrected away.` });

  return out.slice(0, 5);
}

export function ResultInsights({ values, weights }: { values: Record<MetricKey, number>; weights: Partial<Record<MetricKey, number>> }) {
  const insights = buildInsights(values, weights);
  if (!insights.length) return null;
  const tone = { good: "text-forest", warn: "text-[#9a6a17]", info: "text-maroon" } as const;
  return (
    <section className="card border-l-4 border-l-maroon p-5">
      <h2 className="flex items-center gap-2 font-heading text-lg font-semibold text-ink"><Lightbulb className="size-5 text-maroon" /> What these results say</h2>
      <p className="mt-0.5 text-xs text-grey-600">Read automatically from the scorecard below — every claim can be checked against it.</p>
      <ul className="mt-3 space-y-2.5 text-[15px] leading-relaxed text-grey-800">
        {insights.map((i, k) => (
          <li key={k} className="flex gap-2.5">
            <i.icon className={`mt-1 size-4 shrink-0 ${tone[i.tone]}`} />
            <span>{i.text}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
