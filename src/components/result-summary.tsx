import Link from "next/link";
import { Trophy, Route, Battery, EyeOff } from "lucide-react";
import type { MetricKey } from "@/lib/test-cases";
import { fmtPct } from "@/lib/utils";
import type { LeaderboardMedians } from "@/lib/queries";

type Props = {
  values: Record<MetricKey, number>;
  weightedError: number;
  rank: number | null;
  /** median of every ranked model on the public leaderboard, the same yardstick on every card */
  medians: LeaderboardMedians | null;
  /** scored by an older benchmark version: not ranked */
  legacy?: boolean;
  isPrivate?: boolean;
};

/**
 * Three plain measurements, one template: what it is, the number, and the leaderboard median of the
 * same number so the reader can tell at a glance whether it is good. The two accuracy cards share
 * the "blinded" eye badge; the main icon says which set: every drive cycle, or the one hidden cell.
 */
export function ResultSummary({ values, weightedError, rank, medians, legacy, isPrivate }: Props) {
  const median = (k: keyof Omit<LeaderboardMedians, "n">) => (medians && Number.isFinite(medians[k]) ? `${fmtPct(medians[k])} %` : null);
  const compare = (mine: number, k: keyof Omit<LeaderboardMedians, "n">) => {
    const m = median(k);
    if (!m) return "No other ranked models yet";
    const d = mine - medians![k];
    const word = Math.abs(d) < 0.05 ? "about the leaderboard median" : d < 0 ? "better than the leaderboard median" : "worse than the leaderboard median";
    return `${word} (${m})`;
  };
  const standing = legacy ? "Legacy scoring, so not ranked" : rank ? `Rank #${rank} of ${medians?.n ?? rank} on the leaderboard` : isPrivate ? "Private, so not ranked" : "Not ranked";
  // the two accuracy cards share the "blinded" eye; what differs is the set: every drive cycle, or one cell
  const tiles = [
    { icon: Trophy, blinded: false, label: "Score (weighted error)", value: fmtPct(weightedError), sub: <><Link href="/leaderboard" className="text-maroon hover:underline">{standing}</Link>{medians ? ` · median ${median("weightedError")}` : ""}</>, help: "Weighted average of the test-case errors; lower is better" },
    { icon: Route, blinded: true, label: "All 144 blinded cycles", value: fmtPct(values.allCells), sub: compare(values.allCells, "allCells"), help: "Average RMSE over every blinded drive cycle on all four cells (the cycle recordings were never released)" },
    { icon: Battery, blinded: true, label: "Blinded cell only", value: fmtPct(values.blindedCell), sub: compare(values.blindedCell, "blindedCell"), help: "Average RMSE on the 36 cycles of the m448 cell, for which no data of any kind was ever released" },
  ];
  return (
    <section aria-label="Summary" className="grid grid-cols-1 gap-2 sm:grid-cols-3 sm:gap-3">
      {tiles.map((t) => (
        <div key={t.label} className="card flex items-start gap-3 p-3 sm:p-4" title={t.help}>
          <span className="relative mt-0.5 hidden size-9 shrink-0 items-center justify-center rounded-full bg-maroon-100 text-maroon sm:flex">
            <t.icon className="size-[1.125rem]" />
            {t.blinded ? <span className="absolute -bottom-1 -right-1 flex size-[1.125rem] items-center justify-center rounded-full bg-white text-maroon ring-1 ring-maroon-100" title="blinded"><EyeOff className="size-3" /></span> : null}
          </span>
          <div className="min-w-0">
            <p className="font-heading text-[0.6875rem] font-semibold uppercase tracking-wide text-grey-600">{t.label}</p>
            <p className="font-heading text-xl font-bold tabular leading-tight text-ink sm:text-2xl">{t.value}<span className="ml-1 text-base font-semibold text-grey-600">%</span></p>
            <p className="mt-0.5 hidden text-xs leading-snug text-grey-700 sm:block">{t.sub}</p>
          </div>
        </div>
      ))}
    </section>
  );
}
