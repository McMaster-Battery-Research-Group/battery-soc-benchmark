"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis, Cell, LabelList } from "recharts";
import { TEST_CASES, type MetricKey } from "@/lib/test-cases";
import { fmtPct } from "@/lib/utils";
import { CHART, SERIES } from "./palette";
import { ChartFrame, ChartTooltip, axisProps, gridProps } from "./chart-primitives";

type Values = Record<MetricKey, number>;

const ORDER: MetricKey[] = ["allCells", "blindedCell", "nonBlindedCells", "charging", "massM80", "massM448", "massM448N", "massM1000", "standardCycles", "nonStandardCycles", "initialSocError", "currentSensorOffset"];

/** Fig. 5 equivalent: average RMSE per blinded test case for one or more models. */
export function TestCaseBars({
  series,
  title = "Error by test case",
  description = "Average RMS error (% SOC) for each blinded test case. Lower is better.",
}: {
  series: { name: string; values: Values }[];
  title?: string;
  description?: string;
}) {
  const data = ORDER.map((key) => {
    const tc = TEST_CASES.find((t) => t.key === key)!;
    const row: Record<string, string | number> = { key, label: tc.short, test: tc.test };
    series.forEach((s, i) => (row[`s${i}`] = s.values[key]));
    return row;
  });
  const multi = series.length > 1;
  const max = Math.max(...data.flatMap((d) => series.map((_, i) => Number(d[`s${i}`]))));

  return (
    <ChartFrame title={title} description={description} legend={multi ? series.map((s, i) => ({ label: s.name, color: SERIES[i] })) : undefined}>
      <ResponsiveContainer width="100%" height={multi ? 340 : 300}>
        <BarChart data={data} margin={{ top: 18, right: 8, left: 0, bottom: 4 }} barCategoryGap={multi ? "22%" : "30%"} barGap={2}>
          <CartesianGrid {...gridProps} />
          <XAxis dataKey="label" {...axisProps} interval={0} angle={-28} textAnchor="end" height={64} />
          <YAxis {...axisProps} width={44} unit="%" domain={[0, Math.ceil(max * 1.15)]} />
          <Tooltip
            cursor={{ fill: CHART.band }}
            content={({ active, payload, label }) => (
              <ChartTooltip
                active={active}
                label={`Test ${payload?.[0]?.payload.test}: ${label}`}
                rows={(payload ?? []).map((p) => ({ name: multi ? series[Number(String(p.dataKey).slice(1))].name : "RMSE", value: `${fmtPct(Number(p.value))} %`, color: multi ? String(p.color) : undefined }))}
              />
            )}
          />
          {series.map((s, i) => (
            <Bar key={s.name} dataKey={`s${i}`} name={s.name} fill={multi ? SERIES[i] : CHART.primary} radius={[4, 4, 0, 0]} maxBarSize={multi ? 22 : 40} isAnimationActive={false}>
              {!multi ? data.map((d) => <Cell key={String(d.key)} fill={CHART.primary} fillOpacity={d.key === "allCells" ? 1 : 0.82} />) : null}
              {!multi ? <LabelList dataKey="s0" position="top" formatter={(v) => fmtPct(Number(v), 1)} style={{ fill: CHART.textStrong, fontSize: 11, fontFamily: "Arial" }} /> : null}
            </Bar>
          ))}
        </BarChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}
