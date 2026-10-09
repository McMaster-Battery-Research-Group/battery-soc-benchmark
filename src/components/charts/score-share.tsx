"use client";

import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import type { MetricKey } from "@/lib/test-cases";
import { scoreShares } from "@/lib/score-share";
import { fmtPct } from "@/lib/utils";
import { ChartFrame, ChartTooltip } from "./chart-primitives";

/**
 * Part-to-whole: each test group's weight × RMSE as a slice of the weighted error. Four slices,
 * fixed colours, the score in the middle; the list beside it carries the exact figures and the
 * tests behind each slice, so nothing is read from colour alone.
 */
export function ScoreShare({ values, weights, weightedError }: { values: Record<MetricKey, number>; weights?: Partial<Record<MetricKey, number>>; weightedError: number }) {
  const groups = scoreShares(values, weights).filter((g) => g.part > 0);
  return (
    <ChartFrame title="Where the weighted error comes from" description="Each test group's weight × RMSE as a share of the score. The biggest slice is where an improvement moves the rank most.">
      <div className="grid gap-5 sm:grid-cols-[13rem_1fr] sm:items-center">
        <div className="relative mx-auto size-52">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={groups} dataKey="part" nameKey="label" innerRadius="66%" outerRadius="100%" paddingAngle={2} startAngle={90} endAngle={-270} stroke="#fff" strokeWidth={2} isAnimationActive={false}>
                {groups.map((g) => (
                  <Cell key={g.key} fill={g.color} />
                ))}
              </Pie>
              <Tooltip
                content={({ active, payload }) => {
                  const g = payload?.[0]?.payload as (typeof groups)[number] | undefined;
                  return <ChartTooltip active={active && !!g} label={g?.label} rows={g ? [{ name: "Share of score", value: `${Math.round(100 * g.share)} %` }, { name: "Weight × RMSE", value: g.part.toFixed(3) }] : []} />;
                }}
              />
            </PieChart>
          </ResponsiveContainer>
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
            <span className="font-heading text-[0.625rem] font-semibold uppercase tracking-wide text-grey-600">Weighted error</span>
            <span className="font-heading text-2xl font-bold tabular text-ink">{fmtPct(weightedError)} %</span>
          </div>
        </div>
        <ul className="divide-y divide-border text-sm">
          {groups.map((g) => (
            <li key={g.key} className="flex items-start gap-3 py-2">
              <span className="mt-1.5 size-3 shrink-0 rounded-sm" style={{ background: g.color }} aria-hidden />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="font-heading font-semibold text-ink">{g.label}</span>
                  <span className="font-heading font-semibold tabular text-ink">{Math.round(100 * g.share)} %</span>
                </div>
                <p className="text-xs text-grey-700">
                  {g.items.map((i) => `T${i.test} ${i.short} ${fmtPct(i.rmse)} %`).join(" · ")}
                </p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </ChartFrame>
  );
}
