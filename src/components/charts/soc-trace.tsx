"use client";

import * as React from "react";
import { Brush, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, ReferenceLine, ReferenceArea } from "recharts";
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
  const [navKey, setNavKey] = React.useState(0); // bump to remount the brush at full range
  React.useEffect(() => setRange([0, Math.max(0, n - 1)]), [ref?.key, n]);
  // Debounced: the brush fires on every pixel; re-rendering the plots ~15×/s is plenty.
  const pending = React.useRef<number | null>(null);
  const onRange = React.useCallback((s: number, e: number) => {
    if (pending.current !== null) cancelAnimationFrame(pending.current);
    pending.current = requestAnimationFrame(() => {
      pending.current = null;
      setRange((prev) => (prev[0] === s && prev[1] === e ? prev : [s, e]));
    });
  }, []);
  const navInitial = React.useRef<[number, number]>([0, Math.max(0, n - 1)]);
  const resetZoom = () => {
    navInitial.current = [0, Math.max(0, n - 1)];
    setRange([0, Math.max(0, n - 1)]);
    setNavKey((k) => k + 1);
    clearYZoom();
  };
  // Drag a rectangle on either plot: time span zooms both plots, the value span zooms that plot's axis.
  type Plot = "soc" | "err";
  const [sel, setSel] = React.useState<{ plot: Plot; from: number; to: number; y1: number; y2: number } | null>(null);
  const [yZoom, setYZoom] = React.useState<{ soc?: [number, number]; err?: [number, number] }>({});
  const domainsRef = React.useRef<{ soc: [number, number]; err: [number, number] }>({ soc: [0, 100], err: [-20, 20] });
  const PLOT = { soc: { height: 240, top: 8, xAxis: 30 }, err: { height: 170, top: 8, xAxis: 30 } } as const;
  const zoomTo = (t1: number, t2: number) => {
    const lo = Math.min(t1, t2);
    const hi = Math.max(t1, t2);
    const times = ref?.t ?? [];
    let st = times.findIndex((t) => t >= lo);
    let en = times.findIndex((t) => t > hi);
    if (st < 0) st = 0;
    en = en < 0 ? times.length - 1 : Math.max(st, en - 1);
    if (en - st < 3) return false; // too small to be a deliberate selection
    navInitial.current = [st, en];
    setRange([st, en]);
    setNavKey((k) => k + 1); // remount the strip at the new window
    return true;
  };
  const clearYZoom = () => setYZoom({});
  /** Pixel → axis value for a plot, using its fixed margins and current domain. */
  const yValue = (plot: Plot, chartY: number) => {
    const { height, top, xAxis } = PLOT[plot];
    const [lo, hi] = domainsRef.current[plot];
    const frac = Math.min(1, Math.max(0, (chartY - top) / (height - top - xAxis)));
    return hi - frac * (hi - lo);
  };
  const readEvent = (plot: Plot, e: unknown) => {
    const ev = e as { activeLabel?: unknown; chartY?: number } | null;
    const v = ev?.activeLabel;
    const t = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
    const y = typeof ev?.chartY === "number" ? yValue(plot, ev.chartY) : NaN;
    return { t, y };
  };
  const handlersFor = (plot: Plot) => ({
    onMouseDown: (e: unknown) => {
      const { t, y } = readEvent(plot, e);
      if (Number.isFinite(t)) setSel({ plot, from: t, to: t, y1: y, y2: y });
    },
    onMouseMove: (e: unknown) => {
      const { t, y } = readEvent(plot, e);
      if (sel && sel.plot === plot && Number.isFinite(t)) setSel({ ...sel, to: t, y2: Number.isFinite(y) ? y : sel.y2 });
    },
    onMouseUp: () => {
      if (sel && sel.plot === plot && sel.from !== sel.to) {
        const ok = zoomTo(sel.from, sel.to);
        const [lo, hi] = domainsRef.current[plot];
        const dy = Math.abs(sel.y1 - sel.y2);
        // A tall enough box (≥ 8 % of the visible axis) also zooms this plot's value axis.
        if (ok && Number.isFinite(dy) && dy >= 0.08 * (hi - lo)) {
          setYZoom((z) => ({ ...z, [plot]: [round3(Math.min(sel.y1, sel.y2)), round3(Math.max(sel.y1, sel.y2))] }));
        }
      }
      setSel(null);
    },
    onMouseLeave: () => setSel(null),
  });
  const selBox = (plot: Plot) =>
    sel && sel.plot === plot && sel.from !== sel.to ? (
      <ReferenceArea
        x1={Math.min(sel.from, sel.to)}
        x2={Math.max(sel.from, sel.to)}
        {...(Math.abs(sel.y1 - sel.y2) >= 0.08 * Math.abs(domainsRef.current[plot][1] - domainsRef.current[plot][0]) ? { y1: Math.min(sel.y1, sel.y2), y2: Math.max(sel.y1, sel.y2) } : {})}
        fill={CHART.primary}
        fillOpacity={0.12}
        stroke={CHART.primary}
        strokeOpacity={0.5}
      />
    ) : null;
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
  const errDomain: [number, number] = yZoom.err ?? (errScale === "fixed" ? [-20, 20] : [-round2(errMax), round2(errMax)]);
  const socMin = Math.min(...view.flatMap((r) => [r.actual, ...traces.map((_, k) => r[`est${k}`])]));
  const socMax = Math.max(...view.flatMap((r) => [r.actual, ...traces.map((_, k) => r[`est${k}`])]));
  const socDomain: [number, number] = yZoom.soc ?? (fitSoc ? [Math.max(0, Math.floor(socMin - 2)), Math.min(100, Math.ceil(socMax + 2))] : [0, 100]);
  domainsRef.current = { soc: socDomain, err: errDomain };
  const zoomedY = !!(yZoom.soc || yZoom.err);
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
        <span className="text-grey-500">Drag a box on a plot: its width zooms time on both plots, its height zooms that plot&apos;s axis. Or use the strip below.</span>
        {zoomed || zoomedY ? (
          <button onClick={resetZoom} className="ml-auto inline-flex items-center gap-1 font-heading font-medium text-maroon hover:underline">
            <ZoomOut className="size-3.5" /> Reset zoom
          </button>
        ) : null}
      </div>

      {/* SOC */}
      <ResponsiveContainer width="100%" height={240}>
        <LineChart data={view} margin={{ top: 8, right: 12, left: 0, bottom: 0 }} syncId={`soc-${ref.key}`} {...handlersFor("soc")} className="cursor-crosshair select-none">
          <CartesianGrid {...gridProps} />
          <XAxis dataKey="t" {...axisProps} type="number" domain={["dataMin", "dataMax"]} tickFormatter={tFmt} />
          {selBox("soc")}
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
        <LineChart data={view} margin={{ top: 8, right: 12, left: 0, bottom: 0 }} syncId={`soc-${ref.key}`} {...handlersFor("err")} className="cursor-crosshair select-none">
          <CartesianGrid {...gridProps} />
          <XAxis dataKey="t" {...axisProps} type="number" domain={["dataMin", "dataMax"]} tickFormatter={tFmt} />
          {selBox("err")}
          <YAxis {...axisProps} width={48} unit="%" domain={errDomain} allowDataOverflow tickFormatter={(v) => (Math.abs(v) < 1 ? Number(v).toFixed(2) : Number(v).toFixed(0))} />
          <ReferenceLine y={0} stroke={CHART.axis} />
          <Tooltip content={({ active, payload, label }) => <ChartTooltip active={active} label={`t = ${Number(label).toFixed(3)} h`} rows={(payload ?? []).map((p) => ({ name: String(p.name), value: `${Number(p.value) >= 0 ? "+" : ""}${fmtPct(Number(p.value), 2)} %`, color: String(p.stroke) }))} />} />
          {traces.map((_, k) => (
            <Line key={k} type="monotone" dataKey={`err${k}`} name={`${names[k] ?? "Estimated"} error`} stroke={color(k)} strokeWidth={1.5} dot={false} isAnimationActive={false} />
          ))}
        </LineChart>
      </ResponsiveContainer>

      {/* Navigator strip: whole cycle, drag to select a window (uncontrolled + memoized so dragging stays smooth) */}
      <Navigator key={`${ref.key}-${navKey}`} data={data} onRange={onRange} initialRef={navInitial} />
    </ChartFrame>
  );
}

/**
 * Uncontrolled brush over the whole cycle. Memoized on `data` only, so parent
 * re-renders during a drag do not re-render (and fight with) the brush.
 */
const Navigator = React.memo(function Navigator({ data, onRange, initialRef }: { data: Record<string, number>[]; onRange: (s: number, e: number) => void; initialRef: React.MutableRefObject<[number, number]> }) {
  const [s0, e0] = initialRef.current; // read once at mount; the key prop remounts us when the window is set programmatically
  return (
    <div className="mt-1 px-1">
      <ResponsiveContainer width="100%" height={56}>
        <LineChart data={data} margin={{ top: 4, right: 12, left: 48, bottom: 0 }}>
          <Line type="monotone" dataKey="actual" stroke={CHART.actual} strokeWidth={1} dot={false} isAnimationActive={false} />
          <Brush
            dataKey="t"
            height={40}
            travellerWidth={10}
            stroke={CHART.primary}
            fill="rgba(122,0,60,0.04)"
            startIndex={s0}
            endIndex={e0}
            tickFormatter={(v) => `${Number(v).toFixed(1)}h`}
            onChange={(r) => {
              if (r && typeof r.startIndex === "number" && typeof r.endIndex === "number") onRange(r.startIndex, r.endIndex);
            }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}, (prev, next) => prev.data === next.data && prev.onRange === next.onRange); // ignore initialRef changes

function round3(v: number) {
  return Math.round(v * 1000) / 1000;
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
