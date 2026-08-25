"use client";

import * as React from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, ReferenceLine } from "recharts";
import type { TimeSeriesTrace } from "@/evaluator/types";
import { fmtPct } from "@/lib/utils";
import { CHART, SERIES } from "./palette";
import { ChartFrame, ChartTooltip, axisProps, gridProps } from "./chart-primitives";
import { NativeSelect } from "@/components/ui/input";

/**
 * Fig. 7–9 equivalent: actual vs estimated SOC over time plus the error trace.
 * Accepts one trace per model (same cycle) for overlay comparison.
 */
export function SocTrace({
  traces,
  names,
  selectable,
  onSelect,
  options,
}: {
  traces: TimeSeriesTrace[]; // one per model, same cycle
  names: string[];
  selectable?: boolean;
  options?: { key: string; label: string }[];
  onSelect?: (key: string) => void;
}) {
  const ref = traces[0];
  if (!ref) return null;
  const data = ref.t.map((t, i) => {
    const row: Record<string, number> = { t, actual: ref.actual[i] };
    traces.forEach((tr, k) => {
      row[`est${k}`] = tr.estimated[i];
      row[`err${k}`] = tr.estimated[i] - tr.actual[i];
    });
    return row;
  });
  const rmse = traces.map((tr) => Math.sqrt(tr.estimated.reduce((a, e, i) => a + (e - tr.actual[i]) ** 2, 0) / tr.estimated.length));
  const multi = traces.length > 1;
  const legend = [{ label: "Actual SOC", color: CHART.actual }, ...traces.map((_, k) => ({ label: names[k] ?? `Model ${k + 1}`, color: multi ? SERIES[k] : CHART.estimated }))];

  return (
    <ChartFrame
      title={ref.label}
      description={`Estimated vs. reference SOC, then instantaneous error. ${traces.map((_, k) => `${multi ? names[k] + ": " : ""}RMSE ${fmtPct(rmse[k])} %`).join(" · ")}`}
      legend={legend}
      aside={
        selectable && options ? (
          <NativeSelect value={ref.key} onChange={(e) => onSelect?.(e.target.value)} className="h-9 w-56 text-sm" aria-label="Choose drive cycle">
            {options.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
          </NativeSelect>
        ) : null
      }
    >
      <ResponsiveContainer width="100%" height={240}>
        <LineChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }} syncId={ref.key}>
          <CartesianGrid {...gridProps} />
          <XAxis dataKey="t" {...axisProps} type="number" domain={[0, "dataMax"]} tickFormatter={(v) => `${v}h`} />
          <YAxis {...axisProps} width={44} unit="%" domain={[0, 100]} />
          <Tooltip content={({ active, payload, label }) => <ChartTooltip active={active} label={`t = ${Number(label).toFixed(2)} h`} rows={(payload ?? []).map((p) => ({ name: String(p.name), value: `${fmtPct(Number(p.value), 1)} %`, color: String(p.stroke) }))} />} />
          <Line type="monotone" dataKey="actual" name="Actual" stroke={CHART.actual} strokeWidth={2} dot={false} isAnimationActive={false} />
          {traces.map((_, k) => (
            <Line key={k} type="monotone" dataKey={`est${k}`} name={names[k] ?? "Estimated"} stroke={multi ? SERIES[k] : CHART.estimated} strokeWidth={1.75} dot={false} isAnimationActive={false} />
          ))}
        </LineChart>
      </ResponsiveContainer>
      <ResponsiveContainer width="100%" height={150}>
        <LineChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }} syncId={ref.key}>
          <CartesianGrid {...gridProps} />
          <XAxis dataKey="t" {...axisProps} type="number" domain={[0, "dataMax"]} tickFormatter={(v) => `${v}h`} />
          <YAxis {...axisProps} width={44} unit="%" domain={[-20, 20]} ticks={[-20, -10, 0, 10, 20]} />
          <ReferenceLine y={0} stroke={CHART.axis} />
          <Tooltip content={({ active, payload, label }) => <ChartTooltip active={active} label={`t = ${Number(label).toFixed(2)} h`} rows={(payload ?? []).map((p) => ({ name: String(p.name), value: `${Number(p.value) >= 0 ? "+" : ""}${fmtPct(Number(p.value), 1)} %`, color: String(p.stroke) }))} />} />
          {traces.map((_, k) => (
            <Line key={k} type="monotone" dataKey={`err${k}`} name={`${names[k] ?? "Estimated"} error`} stroke={multi ? SERIES[k] : CHART.estimated} strokeWidth={1.5} dot={false} isAnimationActive={false} />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}

/** Stateful wrapper: pick a cycle from a model's stored traces. */
export function SocTracePicker({ tracesByModel, names }: { tracesByModel: TimeSeriesTrace[][]; names: string[] }) {
  const options = tracesByModel[0]?.map((t) => ({ key: t.key, label: t.label })) ?? [];
  const [key, setKey] = React.useState(options[0]?.key ?? "");
  const traces = tracesByModel.map((list) => list.find((t) => t.key === key)).filter(Boolean) as TimeSeriesTrace[];
  if (!traces.length) return null;
  return <SocTrace traces={traces} names={names} selectable options={options} onSelect={setKey} />;
}
