import { Lightbulb, TrendingDown, TrendingUp, ThermometerSnowflake, BatteryCharging, Crosshair, Activity, Scale } from "lucide-react";
import { TEST_CASES, type MetricKey } from "@/lib/test-cases";
import { fmtPct } from "@/lib/utils";

type Insight = {
  icon: React.ComponentType<{ className?: string }>;
  tone: "good" | "warn" | "info";
  /** the verdict, in words anyone can read */
  title: string;
  /** the two numbers behind it, then one short sentence on why it happens */
  text: string;
  /** the tab where the evidence is */
  href: string;
  link: string;
};

const pct = (v: number) => `${fmtPct(v)} %`;

/**
 * Three plain-language observations about a result, chosen by simple rules from the scorecard
 * numbers. Each one states the two numbers it rests on, so it can be checked against the table,
 * and says in everyday words why a battery model behaves that way. Thresholds only pick which
 * sentences appear; they never change a score.
 */
function buildInsights(v: Record<MetricKey, number>, weights: Partial<Record<MetricKey, number>>): Insight[] {
  const out: Insight[] = [];
  const w = (k: MetricKey) => weights[k] ?? TEST_CASES.find((t) => t.key === k)!.weight;
  const overall = Math.max(v.allCells, 0.01);

  // which test costs the most score
  const parts = TEST_CASES.map((t) => ({ t, part: w(t.key) * v[t.key] })).filter((x) => x.part > 0).sort((a, b) => b.part - a.part);
  const total = parts.reduce((s, x) => s + x.part, 0) || 1;
  const top = parts[0];
  if (top && top.part / total > 0.15) {
    const share = Math.round((100 * top.part) / total);
    out.push({
      icon: Scale, tone: "info",
      title: `The ${top.t.label.toLowerCase()} test costs the most`,
      text: `It is ${share} % of the score on its own (${pct(v[top.t.key])} RMSE on that test). Improving this one test would move the rank more than any other.`,
      href: "#scorecard", link: "See the scorecard",
    });
  }

  // generalisation: the cell nobody has data for vs the three with open data
  const ratioBlind = v.blindedCell / Math.max(v.nonBlindedCells, 0.01);
  if (ratioBlind > 1.3) out.push({
    icon: Crosshair, tone: "warn",
    title: "Less accurate on the hidden cell",
    text: `${pct(v.blindedCell)} on the blinded cell against ${pct(v.nonBlindedCells)} on the three cells whose data is public, ${ratioBlind.toFixed(1)} times worse. The model is fitted to the released data rather than to the battery.`,
    href: "#key-cases", link: "See the two cells side by side",
  });
  else out.push({
    icon: Crosshair, tone: "good",
    title: "Works as well on the hidden cell",
    text: `${pct(v.blindedCell)} on the blinded cell, ${pct(v.nonBlindedCells)} on the three cells whose data is public. The model has learned how the battery behaves, not the released files.`,
    href: "#key-cases", link: "See the two cells side by side",
  });

  // temperature
  const cold = v.tempM20, warm = v.temp25;
  if (cold / Math.max(warm, 0.01) > 1.7) out.push({
    icon: ThermometerSnowflake, tone: "warn",
    title: "Accuracy drops in the cold",
    text: `${pct(cold)} at −20 °C against ${pct(warm)} at 25 °C. A cold battery has much higher resistance and a flatter voltage curve, and most models are tuned at room temperature.`,
    href: "#charts", link: "See error against temperature",
  });
  else out.push({
    icon: ThermometerSnowflake, tone: "good",
    title: "Accuracy holds in the cold",
    text: `${pct(cold)} at −20 °C against ${pct(warm)} at 25 °C. The model copes with the higher resistance and flatter voltage curve of a cold battery.`,
    href: "#charts", link: "See error against temperature",
  });

  // charging
  if (v.charging / overall > 2.5) out.push({
    icon: BatteryCharging, tone: "warn",
    title: "Much less accurate while charging",
    text: `${pct(v.charging)} on the charging profiles against ${pct(v.allCells)} across all driving cycles. Models fitted only on discharge data often lose track when current flows the other way.`,
    href: "#key-cases", link: "See the charging run",
  });

  // starting at the wrong SOC
  const r10 = v.initialSocError / overall;
  if (r10 > 3) out.push({
    icon: TrendingDown, tone: "warn",
    title: "Cannot recover from an incorrect starting SOC",
    text: `${pct(v.initialSocError)} when started at the wrong SOC, against ${pct(v.allCells)} overall. The model keeps the starting error instead of correcting it from the measured voltage.`,
    href: "#key-cases", link: "See the incorrect-start runs",
  });
  else if (r10 < 1.8) out.push({
    icon: TrendingUp, tone: "good",
    title: "Recovers from an incorrect starting SOC",
    text: `${pct(v.initialSocError)} when started at the wrong SOC, close to the ${pct(v.allCells)} it gets overall. The model corrects the starting error from the measured voltage.`,
    href: "#key-cases", link: "See the incorrect-start runs",
  });

  // a biased current sensor
  const r11 = v.currentSensorOffset / overall;
  if (r11 > 3) out.push({
    icon: Activity, tone: "warn",
    title: "A biased current sensor throws it off",
    text: `${pct(v.currentSensorOffset)} with a constant current offset, against ${pct(v.allCells)} overall. The bias is added up over time instead of being corrected.`,
    href: "#key-cases", link: "See the sensor-offset runs",
  });
  else if (r11 < 1.8) out.push({
    icon: Activity, tone: "good",
    title: "Tolerates a biased current sensor",
    text: `${pct(v.currentSensorOffset)} with a constant current offset, close to the ${pct(v.allCells)} it gets overall. The bias is corrected away rather than added up.`,
    href: "#key-cases", link: "See the sensor-offset runs",
  });

  // three at most: problems first, then what costs the score, then strengths
  const order = { warn: 0, info: 1, good: 2 };
  return out.sort((a, b) => order[a.tone] - order[b.tone]).slice(0, 3);
}

export function ResultInsights({ values, weights }: { values: Record<MetricKey, number>; weights: Partial<Record<MetricKey, number>> }) {
  const insights = buildInsights(values, weights);
  if (!insights.length) return null;
  const tone = {
    good: { bar: "border-l-forest", icon: "bg-[#e4f1ea] text-forest", word: "Strength" },
    warn: { bar: "border-l-[#d9a84a]", icon: "bg-[#fdf4e3] text-[#9a6a17]", word: "Weak spot" },
    info: { bar: "border-l-maroon", icon: "bg-maroon-100 text-maroon", word: "Where the score goes" },
  } as const;
  return (
    <section aria-labelledby="takeaways">
      <div className="mb-2 flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:gap-2">
        <h2 id="takeaways" className="flex items-center gap-2 font-heading text-lg font-semibold text-ink"><Lightbulb className="size-5 text-maroon" /> Takeaways</h2>
        <p className="text-xs text-grey-600">What the numbers say, in plain words. Each one names the two figures it is based on.</p>
      </div>
      <ul className="grid gap-3 md:grid-cols-3">
        {insights.map((i) => (
          <li key={i.title} className={`card flex items-start gap-3 border-l-4 p-4 ${tone[i.tone].bar}`}>
            <span className={`mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full ${tone[i.tone].icon}`}><i.icon className="size-4" /></span>
            <div className="min-w-0">
              <p className="font-heading text-[0.6875rem] font-semibold uppercase tracking-wide text-grey-600">{tone[i.tone].word}</p>
              <p className="font-heading text-[0.9375rem] font-semibold leading-snug text-ink">{i.title}</p>
              <p className="mt-1 text-sm leading-relaxed text-grey-700">{i.text}</p>
              <a href={i.href} className="mt-1.5 inline-block text-xs font-medium text-maroon hover:underline">{i.link} →</a>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
