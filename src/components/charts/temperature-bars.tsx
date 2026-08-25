"use client";

import { Bar, BarChart, CartesianGrid, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { MetricKey } from "@/lib/test-cases";
import { fmtPct } from "@/lib/utils";
import { CHART, SERIES } from "./palette";
import { ChartFrame, ChartTooltip, axisProps, gridProps } from "./chart-primitives";

const TEMPS: { key: MetricKey; label: string }[] = [
  { key: "tempM20", label: "−20 °C" },
  { key: "tempM10", label: "−10 °C" },
  { key: "temp0", label: "0 °C" },
  { key: "temp10", label: "10 °C" },
  { key: "temp25", label: "25 °C" },
  { key: "temp40", label: "40 °C" },
];

/** Fig. 6 equivalent: error vs ambient temperature (m80 cell, test 9). */
export function TemperatureBars({ series }: { series: { name: string; values: Record<MetricKey, number> }[] }) {
  const multi = series.length > 1;
  const data = TEMPS.map((t) => {
    const row: Record<string, string | number> = { label: t.label };
    series.forEach((s, i) => (row[`s${i}`] = s.values[t.key]));
    return row;
  });
  const max = Math.max(...data.flatMap((d) => series.map((_, i) => Number(d[`s${i}`]))));
  return (
    <ChartFrame title="Error vs. ambient temperature" description="Test 9 — m80 cell, all blinded cycles at each chamber temperature." legend={multi ? series.map((s, i) => ({ label: s.name, color: SERIES[i] })) : undefined}>
      <ResponsiveContainer width="100%" height={260}>
        <BarChart data={data} margin={{ top: 18, right: 8, left: 0, bottom: 0 }} barCategoryGap="28%" barGap={2}>
          <CartesianGrid {...gridProps} />
          <XAxis dataKey="label" {...axisProps} />
          <YAxis {...axisProps} width={44} unit="%" domain={[0, Math.ceil(max * 1.15)]} />
          <Tooltip cursor={{ fill: CHART.band }} content={({ active, payload, label }) => <ChartTooltip active={active} label={String(label)} rows={(payload ?? []).map((p) => ({ name: multi ? series[Number(String(p.dataKey).slice(1))].name : "RMSE", value: `${fmtPct(Number(p.value))} %`, color: multi ? String(p.color) : undefined }))} />} />
          {series.map((s, i) => (
            <Bar key={s.name} dataKey={`s${i}`} fill={multi ? SERIES[i] : CHART.primary} radius={[4, 4, 0, 0]} maxBarSize={44} isAnimationActive={false}>
              {!multi ? <LabelList dataKey="s0" position="top" formatter={(v) => fmtPct(Number(v), 1)} style={{ fill: CHART.textStrong, fontSize: 11, fontFamily: "Arial" }} /> : null}
            </Bar>
          ))}
        </BarChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}
