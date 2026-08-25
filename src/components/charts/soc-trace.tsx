"use client";

import * as React from "react";
import { Brush, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, ReferenceLine } from "recharts";
import { ZoomOut } from "lucide-react";
import type { TimeSeriesTrace } from "@/evaluator/types";
import { fmtPct, cn } from "@/lib/utils";
import { CHART, SERIES } from "./palette";
import { ChartFrame, ChartTooltip, axisProps, gridProps } from "./chart-primitives";
import { NativeSelect } from "@/components/ui/input";

/**
 * Fig. 7–9 equivalent: actual vs estimated SOC over time plus the error trace.
 * Accepts one trace per model (same cycle) for overlay comparison.
 *
 * Interaction: drag on the navigator strip to zoom both plots to a time window;
 * the error axis auto-scales to the visible data (or fixed ±20 % for comparing
 * models); "Fit SOC axis" zooms the SOC plot to the visible range.
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
  const n = ref?.t.length ?? 0;
  const [range, setRange] = React.useState<[number, number]>([0, Math.max(0, n - 1)]);
  const [errScale, setErrScale] = React.useState<"auto" | "fixed">("auto");
  const [fitSoc, setFitSoc] = React.useState(false);
  React.useEffect(() => setRange([0, Math.max(0, n - 1)]), [ref?.key, n]);
  if (!ref) return null;

  const data = ref.t.map((t, i) => {
    const row: Record<string, number> = { i, t, actual: ref.actual[i] };
    traces.forEach((tr, k) => {
      row[`est${k}`] = tr.estimated[i];
      row[`err${k}`] = tr.estimated[i] - tr.actual[i];
    });
    return row;
  });
  const [a, b] = range;
  const view = data.slice(a, b + 1);
  const zoomed = a > 0 || b < n - 1;
  const multi = traces.length > 1;
  const color = (k: number) => (multi ? SERIES[k] : CHART.estimated);

  // Stats over the visible window
  const stats = traces.map((_, k) => {
    const errs = view.map((r) => r[`err${k}`]);
    const rmse = Math.sqrt(errs.reduce((s, e) => s + e * e, 0) / Math.max(1, errs.length));
    const maxAbs = errs.reduce((m, e) => Math.max(m, Math.abs(e)), 0);
    return { rmse, maxAbs };
  });
  const errMax = Math.max(0.5, ...stats.map((s) => s.maxAbs)) * 1.15;
  const errDomain: [number, number] = errScale === "fixed" ? [-20, 20] : [-round2(errMax), round2(errMax)];
  const socMin = Math.min(...view.flatMap((r) => [r.actual, ...traces.map((_, k) => r[`est${k}`])]));
  const socMax = Math.max(...view.flatMap((r) => [r.actual, ...traces.map((_, k) => r[`est${k}`])]));
  const socDomain: [number, number] = fitSoc ? [Math.max(0, Math.floor(socMin - 2)), Math.min(100, Math.ceil(socMax + 2))] : [0, 100];
  const legend = [{ label: "Actual SOC", color: CHART.actual }, ...traces.map((_, k) => ({ label: names[k] ?? `Model ${k + 1}`, color: color(k) }))];
  const tFmt = (v: number) => `${Number(v).toFixed(view.length < 60 ? 2 : 1)}h`;

  return (
    <ChartFrame
      title={ref.label}
      description={
        <>
          {zoomed ? `Window ${ref.t[a].toFixed(2)}–${ref.t[b].toFixed(2)} h · ` : "Whole cycle · "}
          {traces.map((_, k) => `${multi ? (names[k] ?? `Model ${k + 1}`) + ": " : ""}RMSE ${fmtPct(stats[k].rmse)} %, max ${fmtPct(stats[k].maxAbs, 1)} %`).join(" · ")}
        </>
      }
      legend={legend}
      aside={
        selectable && options ? (
          <NativeSelect value={ref.key} onChange={(e) => onSelect?.(e.target.value)} className="h-9 w-56 text-sm" aria-label="Choose drive cycle">
            {options.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
          </NativeSelect>
        ) : null
      }
    >
      {/* Controls */}
      <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-2 px-1 text-xs text-grey-700">
        <span className="inline-flex items-center gap-1.5">
          Error axis
          <span className="inline-flex rounded-brand border border-border p-0.5" role="group" aria-label="Error axis scale">
            {(["auto", "fixed"] as const).map((k) => (
              <button key={k} onClick={() => setErrScale(k)} className={cn("rounded-[3px] px-2 py-0.5 font-heading font-medium", errScale === k ? "bg-maroon text-white" : "hover:bg-grey-100")} aria-pressed={errScale === k}>
                {k === "auto" ? "Auto" : "±20 %"}
              </button>
            ))}
          </span>
        </span>
        <label className="inline-flex items-center gap-1.5">
          <input type="checkbox" checked={fitSoc} onChange={(e) => setFitSoc(e.target.checked)} className="accent-maroon" /> Fit SOC axis to data
        </label>
        <span className="text-grey-500">Drag on the strip below the charts to zoom.</span>
        {zoomed ? (
          <button onClick={() => setRange([0, n - 1])} className="ml-auto inline-flex items-center gap-1 font-heading font-medium text-maroon hover:underline">
            <ZoomOut className="size-3.5" /> Reset zoom
          </button>
        ) : null}
      </div>

      {/* SOC */}
      <ResponsiveContainer width="100%" height={240}>
        <LineChart data={view} margin={{ top: 8, right: 12, left: 0, bottom: 0 }} syncId={`soc-${ref.key}`}>
          <CartesianGrid {...gridProps} />
          <XAxis dataKey="t" {...axisProps} type="number" domain={["dataMin", "dataMax"]} tickFormatter={tFmt} />
          <YAxis {...axisProps} width={48} unit="%" domain={socDomain} allowDataOverflow />
          <Tooltip content={({ active, payload, label }) => <ChartTooltip active={active} label={`t = ${Number(label).toFixed(3)} h`} rows={(payload ?? []).map((p) => ({ name: String(p.name), value: `${fmtPct(Number(p.value), 2)} %`, color: String(p.stroke) }))} />} />
          <Line type="monotone" dataKey="actual" name="Actual" stroke={CHART.actual} strokeWidth={2} dot={false} isAnimationActive={false} />
          {traces.map((_, k) => (
            <Line key={k} type="monotone" dataKey={`est${k}`} name={names[k] ?? "Estimated"} stroke={color(k)} strokeWidth={1.75} dot={false} isAnimationActive={false} />
          ))}
        </LineChart>
      </ResponsiveContainer>

      {/* Error */}
      <ResponsiveContainer width="100%" height={170}>
        <LineChart data={view} margin={{ top: 8, right: 12, left: 0, bottom: 0 }} syncId={`soc-${ref.key}`}>
          <CartesianGrid {...gridProps} />
          <XAxis dataKey="t" {...axisProps} type="number" domain={["dataMin", "dataMax"]} tickFormatter={tFmt} />
          <YAxis {...axisProps} width={48} unit="%" domain={errDomain} allowDataOverflow tickFormatter={(v) => (Math.abs(v) < 1 ? Number(v).toFixed(2) : Number(v).toFixed(0))} />
          <ReferenceLine y={0} stroke={CHART.axis} />
          <Tooltip content={({ active, payload, label }) => <ChartTooltip active={active} label={`t = ${Number(label).toFixed(3)} h`} rows={(payload ?? []).map((p) => ({ name: String(p.name), value: `${Number(p.value) >= 0 ? "+" : ""}${fmtPct(Number(p.value), 2)} %`, color: String(p.stroke) }))} />} />
          {traces.map((_, k) => (
            <Line key={k} type="monotone" dataKey={`err${k}`} name={`${names[k] ?? "Estimated"} error`} stroke={color(k)} strokeWidth={1.5} dot={false} isAnimationActive={false} />
          ))}
        </LineChart>
      </ResponsiveContainer>

      {/* Navigator strip: whole cycle, drag to select a window */}
      <div className="mt-1 px-1">
        <ResponsiveContainer width="100%" height={56}>
          <LineChart data={data} margin={{ top: 4, right: 12, left: 48, bottom: 0 }}>
            <Line type="monotone" dataKey="actual" stroke={CHART.actual} strokeWidth={1} dot={false} isAnimationActive={false} />
            <Brush
              dataKey="t"
              height={40}
              travellerWidth={8}
              stroke={CHART.primary}
              fill="rgba(122,0,60,0.04)"
              startIndex={a}
              endIndex={b}
              tickFormatter={(v) => `${Number(v).toFixed(1)}h`}
              onChange={(r) => {
                if (r && typeof r.startIndex === "number" && typeof r.endIndex === "number" && (r.startIndex !== a || r.endIndex !== b)) setRange([r.startIndex, r.endIndex]);
              }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </ChartFrame>
  );
}

function round2(v: number) {
  // pleasant axis limit: 1–2–5 progression
  const p = 10 ** Math.floor(Math.log10(v));
  const m = v / p;
  return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * p;
}

/** Stateful wrapper: pick a cycle from a model's stored traces. */
export function SocTracePicker({ tracesByModel, names }: { tracesByModel: TimeSeriesTrace[][]; names: string[] }) {
  const options = tracesByModel[0]?.map((t) => ({ key: t.key, label: t.label })) ?? [];
  const [key, setKey] = React.useState(options[0]?.key ?? "");
  const traces = tracesByModel.map((list) => list.find((t) => t.key === key)).filter(Boolean) as TimeSeriesTrace[];
  if (!traces.length) return null;
  return <SocTrace traces={traces} names={names} selectable options={options} onSelect={setKey} />;
}
