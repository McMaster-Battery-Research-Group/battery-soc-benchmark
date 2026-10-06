import Link from "next/link";
import { Trophy, EyeOff, ThermometerSnowflake, ThermometerSun, BatteryCharging, Weight, Route, ShieldCheck, ShieldAlert } from "lucide-react";
import { TEST_CASES, type MetricKey } from "@/lib/test-cases";
import { fmtPct } from "@/lib/utils";

type Props = {
  values: Record<MetricKey, number>;
  weightedError: number;
  rank: number | null;
  /** scored by an older benchmark version: not ranked */
  legacy?: boolean;
};

const CONDITIONS: MetricKey[] = ["charging", "massM80", "massM448", "massM448N", "massM1000", "standardCycles", "nonStandardCycles", "tempM20", "tempM10", "temp0", "temp10", "temp25", "temp40"];

function conditionIcon(key: MetricKey) {
  if (key.startsWith("temp")) return key === "temp40" || key === "temp25" ? ThermometerSun : ThermometerSnowflake;
  if (key === "charging") return BatteryCharging;
  if (key.startsWith("mass")) return Weight;
  return Route;
}

/** The four numbers that summarise a result, each with the comparison that gives it meaning. */
export function ResultSummary({ values, weightedError, rank, legacy }: Props) {
  const label = (k: MetricKey) => TEST_CASES.find((t) => t.key === k)!.label;
  // mid-sentence form: lower-case words, but never units like °C
  const lower = (t: string) => (/[°A-Z]{2}/.test(t) ? t : t.charAt(0).toLowerCase() + t.slice(1));
  const worst = CONDITIONS.reduce((m, k) => (values[k] > values[m] ? k : m), CONDITIONS[0]);
  const best = CONDITIONS.reduce((m, k) => (values[k] < values[m] ? k : m), CONDITIONS[0]);
  const robustWorst: MetricKey = values.initialSocError >= values.currentSensorOffset ? "initialSocError" : "currentSensorOffset";
  const robustOther: MetricKey = robustWorst === "initialSocError" ? "currentSensorOffset" : "initialSocError";
  const robustRatio = values[robustWorst] / Math.max(values.allCells, 0.01);
  const WorstIcon = conditionIcon(worst);
  const tiles = [
    {
      icon: Trophy,
      label: "Weighted error",
      value: fmtPct(weightedError),
      unit: "%",
      sub: legacy ? "Legacy scoring, not ranked" : rank ? <Link href="/leaderboard" className="text-maroon hover:underline">Rank #{rank} on the leaderboard</Link> : "Leaderboard score",
    },
    {
      icon: EyeOff,
      label: "Blinded cell",
      value: fmtPct(values.blindedCell),
      unit: "%",
      sub: `${fmtPct(values.nonBlindedCells)} % on the cells with open data`,
    },
    {
      icon: WorstIcon,
      label: "Hardest condition",
      value: fmtPct(values[worst]),
      unit: "%",
      sub: `${label(worst)} · best: ${lower(label(best))} at ${fmtPct(values[best])} %`,
    },
    {
      icon: robustRatio > 3 ? ShieldAlert : ShieldCheck,
      label: "Robustness",
      value: fmtPct(values[robustWorst]),
      unit: "%",
      sub: `${label(robustWorst)} · ${lower(label(robustOther))}: ${fmtPct(values[robustOther])} %`,
      warn: robustRatio > 3,
    },
  ];
  return (
    <section aria-label="Summary" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {tiles.map((t) => (
        <div key={t.label} className="card flex items-start gap-3 p-4">
          <span className={`mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full ${t.warn ? "bg-[#fdf4e3] text-[#9a6a17]" : "bg-maroon-100 text-maroon"}`}><t.icon className="size-[18px]" /></span>
          <div className="min-w-0">
            <p className="font-heading text-[11px] font-semibold uppercase tracking-wide text-grey-600">{t.label}</p>
            <p className="font-heading text-2xl font-bold tabular leading-tight text-ink">{t.value}<span className="ml-1 text-base font-semibold text-grey-600">{t.unit}</span></p>
            <p className="mt-0.5 text-xs leading-snug text-grey-700">{t.sub}</p>
          </div>
        </div>
      ))}
    </section>
  );
}
