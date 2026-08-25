"use client";

import * as React from "react";
import { Brush, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, ReferenceLine, ReferenceArea } from "recharts";
import { ZoomIn, ZoomOut, Hand, MoveHorizontal, MoveVertical, Maximize2 } from "lucide-react";
import type { TimeSeriesTrace } from "@/evaluator/types";
import { fmtPct, cn } from "@/lib/utils";
import { CHART, SERIES } from "./palette";
import { ChartFrame, ChartTooltip, axisProps, gridProps } from "./chart-primitives";
import { NativeSelect } from "@/components/ui/input";
import { Tooltip as Tip, TooltipProvider } from "@/components/ui/tooltip";

/**
 * Fig. 7–9 equivalent: actual vs estimated SOC over time plus the error trace.
 * Accepts one trace per model (same cycle) for overlay comparison.
 *
 * Interaction follows the MATLAB figure / Simulink scope toolbar:
 *   Zoom (box)  drag a rectangle → zoom time on both plots and value on that plot; click → zoom in 2× at the point
 *   Zoom X      drag → time span only                Zoom Y  drag → value span of that plot only
 *   Pan         drag → move the view                  Wheel   zoom in/out around the cursor (time)
 *   Zoom out    step out 2×                           Fit     restore the whole cycle and default axes
 *   Double-click anywhere on a plot restores the view.
 */
type Plot = "soc" | "err";
type Mode = "box" | "x" | "y" | "pan";
const PLOT = { soc: { height: 240, top: 8, xAxis: 30 }, err: { height: 170, top: 8, xAxis: 30 } } as const;
const Y_AXIS_W = 48, RIGHT = 12;

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
  const [yZoom, setYZoom] = React.useState<{ soc?: [number, number]; err?: [number, number] }>({});
  const [mode, setMode] = React.useState<Mode>("box");
  const [errScale, setErrScale] = React.useState<"auto" | "fixed">("auto");
  const [fitSoc, setFitSoc] = React.useState(false);
  const [navKey, setNavKey] = React.useState(0);
  const navInitial = React.useRef<[number, number]>([0, Math.max(0, n - 1)]);
  const domainsRef = React.useRef<{ soc: [number, number]; err: [number, number] }>({ soc: [0, 100], err: [-20, 20] });
  const wrapRef = React.useRef<HTMLDivElement>(null);
  const [sel, setSel] = React.useState<{ plot: Plot; from: number; to: number; y1: number; y2: number } | null>(null);
  const pan = React.useRef<{ plot: Plot; x: number; y: number; range: [number, number]; yDom: [number, number] } | null>(null);

  React.useEffect(() => {
    navInitial.current = [0, Math.max(0, n - 1)];
    setRange([0, Math.max(0, n - 1)]);
    setYZoom({});
    setSel(null);
    pan.current = null;
  }, [ref?.key, n]);

  const applyRange = React.useCallback(
    (s: number, e: number, remountNav = true) => {
      if (!Number.isFinite(s) || !Number.isFinite(e)) return;
      const st = Math.max(0, Math.min(s, n - 1));
      const en = Math.max(st, Math.min(e, n - 1));
      navInitial.current = [st, en];
      setRange([st, en]);
      if (remountNav) setNavKey((k) => k + 1);
    },
    [n],
  );

  // Navigator brush → range (rAF-debounced; the brush is uncontrolled and memoized so it stays smooth)
  const pending = React.useRef<number | null>(null);
  const onBrush = React.useCallback((s: number, e: number) => {
    if (pending.current !== null) cancelAnimationFrame(pending.current);
    pending.current = requestAnimationFrame(() => {
      pending.current = null;
      navInitial.current = [s, e];
      setRange((prev) => (prev[0] === s && prev[1] === e ? prev : [s, e]));
    });
  }, []);

  const restore = () => {
    applyRange(0, n - 1);
    setYZoom({});
  };
  const zoomOut = () => {
    const [a, b] = range;
    const half = Math.max(2, Math.round((b - a + 1) / 2));
    applyRange(a - half, b + half);
    setYZoom((z) => {
      const grow = (d?: [number, number]) => (d ? ([d[0] - (d[1] - d[0]) / 2, d[1] + (d[1] - d[0]) / 2] as [number, number]) : undefined);
      return { soc: grow(z.soc), err: grow(z.err) };
    });
  };
  const zoomAtIndex = (i: number, factor: number) => {
    const [a, b] = range;
    const width = b - a + 1;
    const newW = Math.max(8, Math.round(width / factor));
    const frac = width > 1 ? (i - a) / (width - 1) : 0.5;
    const s = Math.round(i - frac * newW);
    applyRange(s, s + newW - 1);
  };
  const zoomTimeSpan = (t1: number, t2: number) => {
    const lo = Math.min(t1, t2);
    const hi = Math.max(t1, t2);
    const times = ref?.t ?? [];
    let s = times.findIndex((t) => t >= lo);
    let e = times.findIndex((t) => t > hi);
    if (s < 0) s = 0;
    e = e < 0 ? times.length - 1 : Math.max(s, e - 1);
    if (e - s < 3) return false;
    applyRange(s, e);
    return true;
  };

  // ---- pixel helpers (fixed margins make this exact enough)
  const plotWidth = () => Math.max(1, (wrapRef.current?.clientWidth ?? 800) - Y_AXIS_W - RIGHT);
  const yValue = (plot: Plot, chartY: number) => {
    const { height, top, xAxis } = PLOT[plot];
    const [lo, hi] = domainsRef.current[plot];
    const frac = Math.min(1, Math.max(0, (chartY - top) / (height - top - xAxis)));
    return hi - frac * (hi - lo);
  };
  const readEvent = (plot: Plot, e: unknown) => {
    const ev = e as { activeLabel?: unknown; chartX?: number; chartY?: number } | null;
    const v = ev?.activeLabel;
    const t = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
    const y = typeof ev?.chartY === "number" ? yValue(plot, ev.chartY) : NaN;
    return { t, y, chartX: ev?.chartX ?? NaN, chartY: ev?.chartY ?? NaN };
  };

  // Pan: native pointer events on the wrapper (independent of Recharts' event payloads).
  const panHandlers = (plot: Plot) =>
    mode !== "pan"
      ? {}
      : {
          onPointerDown: (e: React.PointerEvent<HTMLDivElement>) => {
            if (e.button !== 0) return;
            e.currentTarget.setPointerCapture(e.pointerId);
            pan.current = { plot, x: e.clientX, y: e.clientY, range, yDom: domainsRef.current[plot] };
          },
          onPointerMove: (e: React.PointerEvent<HTMLDivElement>) => {
            const p = pan.current;
            if (!p || p.plot !== plot) return;
            const [a, b] = p.range;
            const width = Math.min(n, b - a + 1);
            const dxSamples = Math.round(((p.x - e.clientX) / plotWidth()) * width);
            const s = Math.max(0, Math.min(n - width, a + dxSamples));
            if (Number.isFinite(s)) {
              navInitial.current = [s, s + width - 1];
              setRange((prev) => (prev[0] === s ? prev : [s, s + width - 1]));
            }
            const { height, top, xAxis } = PLOT[plot];
            const perPx = (p.yDom[1] - p.yDom[0]) / (height - top - xAxis);
            const dy = (e.clientY - p.y) * perPx;
            if (Number.isFinite(dy) && dy !== 0) setYZoom((z) => ({ ...z, [plot]: [round3(p.yDom[0] + dy), round3(p.yDom[1] + dy)] }));
          },
          onPointerUp: (e: React.PointerEvent<HTMLDivElement>) => {
            if (!pan.current) return;
            pan.current = null;
            try {
              e.currentTarget.releasePointerCapture(e.pointerId);
            } catch {}
            setNavKey((k) => k + 1);
          },
          onPointerCancel: () => {
            pan.current = null;
            setNavKey((k) => k + 1);
          },
        };

  const handlersFor = (plot: Plot) => ({
    onMouseDown: (e: unknown) => {
      if (mode === "pan") return;
      const { t, y } = readEvent(plot, e);
      if (Number.isFinite(t)) setSel({ plot, from: t, to: t, y1: y, y2: y });
    },
    onMouseMove: (e: unknown) => {
      if (mode === "pan") return;
      const { t, y } = readEvent(plot, e);
      if (sel && sel.plot === plot && Number.isFinite(t)) setSel({ ...sel, to: t, y2: Number.isFinite(y) ? y : sel.y2 });
    },
    onMouseUp: (e: unknown) => {
      if (mode === "pan") return;
      if (!sel || sel.plot !== plot) return setSel(null);
      const [lo, hi] = domainsRef.current[plot];
      const dy = Math.abs(sel.y1 - sel.y2);
      const tallEnough = Number.isFinite(dy) && dy >= 0.05 * (hi - lo);
      const wideEnough = sel.from !== sel.to;
      if (mode === "box" && !wideEnough && !tallEnough) {
        // click: zoom in 2× at the point (MATLAB "zoom in" click behaviour)
        const { t } = readEvent(plot, e);
        const times = ref?.t ?? [];
        const i = times.findIndex((v) => v >= t);
        zoomAtIndex(i < 0 ? 0 : i, 2);
      } else if (mode === "box" || mode === "x") {
        if (wideEnough) zoomTimeSpan(sel.from, sel.to);
        if (mode === "box" && tallEnough) setYZoom((z) => ({ ...z, [plot]: [round3(Math.min(sel.y1, sel.y2)), round3(Math.max(sel.y1, sel.y2))] }));
      } else if (mode === "y" && tallEnough) {
        setYZoom((z) => ({ ...z, [plot]: [round3(Math.min(sel.y1, sel.y2)), round3(Math.max(sel.y1, sel.y2))] }));
      }
      setSel(null);
    },
    onMouseLeave: () => setSel(null),
    onDoubleClick: () => restore(),
  });

  // Wheel: zoom time around the cursor (both plots). Ctrl/⌘ + wheel zooms the value axis of the hovered plot.
  const onWheel = (plot: Plot) => (e: React.WheelEvent<HTMLDivElement>) => {
    if (!wrapRef.current) return;
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.25 : 1 / 1.25;
    const rect = e.currentTarget.getBoundingClientRect();
    if (e.ctrlKey || e.metaKey) {
      const [lo, hi] = domainsRef.current[plot];
      const frac = Math.min(1, Math.max(0, (e.clientY - rect.top - PLOT[plot].top) / (PLOT[plot].height - PLOT[plot].top - PLOT[plot].xAxis)));
      const pivot = hi - frac * (hi - lo);
      const span = (hi - lo) / factor;
      setYZoom((z) => ({ ...z, [plot]: [round3(pivot - (1 - frac) * span), round3(pivot + frac * span)] }));
      return;
    }
    const fx = Math.min(1, Math.max(0, (e.clientX - rect.left - Y_AXIS_W) / plotWidth()));
    const [a, b] = range;
    zoomAtIndex(Math.round(a + fx * (b - a)), factor);
  };

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
  const zoomed = a > 0 || b < n - 1 || !!yZoom.soc || !!yZoom.err;
  const multi = traces.length > 1;
  const color = (k: number) => (multi ? SERIES[k] : CHART.estimated);

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
  const legend = [{ label: "Actual SOC", color: CHART.actual }, ...traces.map((_, k) => ({ label: names[k] ?? `Model ${k + 1}`, color: color(k) }))];
  const tFmt = (v: number) => `${Number(v).toFixed(view.length < 60 ? 2 : 1)}h`;
  const cursor = mode === "pan" ? "cursor-grab active:cursor-grabbing" : mode === "x" ? "cursor-ew-resize" : mode === "y" ? "cursor-ns-resize" : "cursor-crosshair";

  const selBox = (plot: Plot) => {
    if (!sel || sel.plot !== plot) return null;
    const [lo, hi] = domainsRef.current[plot];
    const tall = Math.abs(sel.y1 - sel.y2) >= 0.05 * (hi - lo);
    const wide = sel.from !== sel.to;
    if (mode === "y") return tall && view.length ? <ReferenceArea x1={view[0].t} x2={view[view.length - 1].t} y1={Math.min(sel.y1, sel.y2)} y2={Math.max(sel.y1, sel.y2)} fill={CHART.primary} fillOpacity={0.12} stroke={CHART.primary} strokeOpacity={0.5} /> : null;
    if (!wide) return null;
    const yProps = mode === "box" && tall ? { y1: Math.min(sel.y1, sel.y2), y2: Math.max(sel.y1, sel.y2) } : {};
    return <ReferenceArea x1={Math.min(sel.from, sel.to)} x2={Math.max(sel.from, sel.to)} {...yProps} fill={CHART.primary} fillOpacity={0.12} stroke={CHART.primary} strokeOpacity={0.5} />;
  };

  const tools: { id: Mode | "out" | "fit"; label: string; icon: React.ComponentType<{ className?: string }>; tip: string }[] = [
    { id: "box", label: "Zoom", icon: ZoomIn, tip: "Drag a box to zoom (time on both plots, value on this plot). Click to zoom in 2×. Wheel zooms time; Ctrl+wheel zooms value." },
    { id: "x", label: "Zoom X", icon: MoveHorizontal, tip: "Drag to zoom the time axis only." },
    { id: "y", label: "Zoom Y", icon: MoveVertical, tip: "Drag to zoom the value axis of this plot only." },
    { id: "pan", label: "Pan", icon: Hand, tip: "Drag to move the view." },
    { id: "out", label: "Zoom out", icon: ZoomOut, tip: "Step out 2×." },
    { id: "fit", label: "Fit", icon: Maximize2, tip: "Restore the whole cycle and default axes (or double-click a plot)." },
  ];

  return (
    <ChartFrame
      title={ref.label}
      description={
        <>
          {a > 0 || b < n - 1 ? `Window ${ref.t[a].toFixed(2)}–${ref.t[b].toFixed(2)} h · ` : "Whole cycle · "}
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
      <TooltipProvider>
        {/* Toolbar — MATLAB figure style */}
        <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-2 px-1 text-xs text-grey-700">
          <div className="inline-flex rounded-brand border border-border p-0.5" role="toolbar" aria-label="Zoom and pan tools">
            {tools.map((t) => {
              const isMode = t.id !== "out" && t.id !== "fit";
              const active = isMode && mode === t.id;
              return (
                <Tip key={t.id} content={t.tip}>
                  <button
                    type="button"
                    aria-pressed={isMode ? active : undefined}
                    onClick={() => (t.id === "out" ? zoomOut() : t.id === "fit" ? restore() : setMode(t.id))}
                    className={cn("inline-flex items-center gap-1 rounded-[3px] px-2 py-1 font-heading font-medium", active ? "bg-maroon text-white" : "text-grey-800 hover:bg-grey-100", (t.id === "out" || t.id === "fit") && "border-l border-border")}
                  >
                    <t.icon className="size-3.5" /> {t.label}
                  </button>
                </Tip>
              );
            })}
          </div>
          <span className="inline-flex items-center gap-1.5">
            Error axis
            <span className="inline-flex rounded-brand border border-border p-0.5" role="group" aria-label="Error axis scale">
              {(["auto", "fixed"] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => {
                    setErrScale(k);
                    setYZoom((z) => ({ ...z, err: undefined }));
                  }}
                  className={cn("rounded-[3px] px-2 py-0.5 font-heading font-medium", errScale === k && !yZoom.err ? "bg-maroon text-white" : "hover:bg-grey-100")}
                  aria-pressed={errScale === k && !yZoom.err}
                >
                  {k === "auto" ? "Auto" : "±20 %"}
                </button>
              ))}
            </span>
          </span>
          <label className="inline-flex items-center gap-1.5">
            <input
              type="checkbox"
              checked={fitSoc}
              onChange={(e) => {
                setFitSoc(e.target.checked);
                setYZoom((z) => ({ ...z, soc: undefined }));
              }}
              className="accent-maroon"
            />{" "}
            Fit SOC axis
          </label>
          {zoomed ? <span className="ml-auto text-grey-500">Double-click a plot to restore.</span> : null}
        </div>

        <div ref={wrapRef}>
          {/* SOC */}
          <div onWheel={onWheel("soc")} {...panHandlers("soc")} className={cn("select-none touch-none", cursor)}>
            <ResponsiveContainer width="100%" height={PLOT.soc.height}>
              <LineChart data={view} margin={{ top: PLOT.soc.top, right: RIGHT, left: 0, bottom: 0 }} syncId={`soc-${ref.key}`} {...handlersFor("soc")}>
                <CartesianGrid {...gridProps} />
                <XAxis dataKey="t" {...axisProps} type="number" domain={["dataMin", "dataMax"]} tickFormatter={tFmt} height={PLOT.soc.xAxis} />
                {selBox("soc")}
                <YAxis {...axisProps} width={Y_AXIS_W} unit="%" domain={socDomain} allowDataOverflow />
                <Tooltip content={({ active, payload, label }) => <ChartTooltip active={active} label={`t = ${Number(label).toFixed(3)} h`} rows={(payload ?? []).map((p) => ({ name: String(p.name), value: `${fmtPct(Number(p.value), 2)} %`, color: String(p.stroke) }))} />} />
                <Line type="monotone" dataKey="actual" name="Actual" stroke={CHART.actual} strokeWidth={2} dot={false} isAnimationActive={false} />
                {traces.map((_, k) => (
                  <Line key={k} type="monotone" dataKey={`est${k}`} name={names[k] ?? "Estimated"} stroke={color(k)} strokeWidth={1.75} dot={false} isAnimationActive={false} />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Error */}
          <div onWheel={onWheel("err")} {...panHandlers("err")} className={cn("select-none touch-none", cursor)}>
            <ResponsiveContainer width="100%" height={PLOT.err.height}>
              <LineChart data={view} margin={{ top: PLOT.err.top, right: RIGHT, left: 0, bottom: 0 }} syncId={`soc-${ref.key}`} {...handlersFor("err")}>
                <CartesianGrid {...gridProps} />
                <XAxis dataKey="t" {...axisProps} type="number" domain={["dataMin", "dataMax"]} tickFormatter={tFmt} height={PLOT.err.xAxis} />
                {selBox("err")}
                <YAxis {...axisProps} width={Y_AXIS_W} unit="%" domain={errDomain} allowDataOverflow tickFormatter={(v) => (Math.abs(v) < 1 ? Number(v).toFixed(2) : Number(v).toFixed(1))} />
                <ReferenceLine y={0} stroke={CHART.axis} />
                <Tooltip content={({ active, payload, label }) => <ChartTooltip active={active} label={`t = ${Number(label).toFixed(3)} h`} rows={(payload ?? []).map((p) => ({ name: String(p.name), value: `${Number(p.value) >= 0 ? "+" : ""}${fmtPct(Number(p.value), 2)} %`, color: String(p.stroke) }))} />} />
                {traces.map((_, k) => (
                  <Line key={k} type="monotone" dataKey={`err${k}`} name={`${names[k] ?? "Estimated"} error`} stroke={color(k)} strokeWidth={1.5} dot={false} isAnimationActive={false} />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Navigator strip: whole cycle, drag to select a window */}
        <Navigator key={`${ref.key}-${navKey}`} data={data} onRange={onBrush} initialRef={navInitial} />
      </TooltipProvider>
    </ChartFrame>
  );
}

const Navigator = React.memo(
  function Navigator({ data, onRange, initialRef }: { data: Record<string, number>[]; onRange: (s: number, e: number) => void; initialRef: React.MutableRefObject<[number, number]> }) {
    // read once at mount; remounted via key when the window is set programmatically. Clamp: the ref may lag a cycle change.
    const last = Math.max(0, data.length - 1);
    const s0 = Math.min(Math.max(0, initialRef.current[0]), last);
    const e0 = Math.min(Math.max(s0, initialRef.current[1]), last);
    return (
      <div className="mt-1 px-1">
        <ResponsiveContainer width="100%" height={56}>
          <LineChart data={data} margin={{ top: 4, right: RIGHT, left: Y_AXIS_W, bottom: 0 }}>
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
  },
  (prev, next) => prev.data === next.data && prev.onRange === next.onRange,
);

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
