"use client";

import * as React from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, XAxis, YAxis } from "recharts";
import type { PerCycleRow, TimeSeriesTrace } from "@/evaluator/types";
import type { MetricKey } from "@/lib/test-cases";
import { errorOf } from "@/lib/traces";
import { fmtPct } from "@/lib/utils";
import { CHART, SERIES } from "./palette";
import { ChartFrame, axisProps, gridProps } from "./chart-primitives";
import { TemperatureBars } from "./temperature-bars";
import { OffsetRmseChart } from "./offset-rmse";
import { Alert } from "@/components/ui/misc";
import { EyeOff } from "lucide-react";
import { RunChips, type RunContext } from "./run-context";

/**
 * Every figure of the lab's original Create_Figures.m, as one gallery (tracker 2026-10-14 #22):
 * each MATLAB figure is a card, each of its subplot columns a panel with the SOC traces on top and
 * the estimation error below, legend carrying the RMSE as the script printed it. Static small
 * multiples; the same cycles can be zoomed under "Key cases" and "All 144 cycles".
 */

type Pt = { t: number; v: number };
type LineSpec = { label: string; color: string; points: Pt[]; width?: number; dashed?: boolean };
type PanelSpec = {
  title: string;
  /** what the run is, shown as icon chips under the title */
  run: RunContext;
  /** the SOC plot: actual + one or more estimates; absent on the blinded cell (error only) */
  soc?: LineSpec[];
  err: LineSpec[];
  /** one row per estimate: label and RMSE as text */
  legend: { label: string; color: string; rmse: string }[];
  note?: string;
};

// MATLAB figures 1–5: the drive-cycle panels, in the script's order; cycle "charge" matches the CC-CV profile
const CYCLE_FIGURES: { id: string; title: string; blurb: string; panels: { cell: string; cycle: string; temp: number; title: string }[] }[] = [
  { id: "cells", title: "Tests 1–3 · Blinded vs. non-blinded cell", blurb: "The same LA92 cycle at 10 °C on the open m448-N cell and on the blinded m448 cell, for which no data was ever released. A gap between the two is over-fitting to the open cells.", panels: [{ cell: "m448-N", cycle: "LA92", temp: 10, title: "Non-blinded (m448-N) LA92 at 10 °C" }, { cell: "m448", cycle: "LA92", temp: 10, title: "Blinded (m448) LA92 at 10 °C" }] },
  { id: "charging", title: "Test 4 · Driving vs. charging", blurb: "An aggressive drive cycle and a CC-CV charge, both on the m80 cell at 25 °C. Estimators tuned on discharge often mis-track while charging.", panels: [{ cell: "m80", cycle: "US06", temp: 25, title: "m80 US06 at 25 °C" }, { cell: "m80", cycle: "charge", temp: 25, title: "m80 charging (CC-CV) at 25 °C" }] },
  { id: "payload", title: "Tests 5–6 · Payload", blurb: "The same UDDS cycle at 10 °C for the three vehicle loads: 80 kg (lowest currents), 448 kg and 1000 kg (highest currents).", panels: [{ cell: "m80", cycle: "UDDS", temp: 10, title: "m80 UDDS at 10 °C" }, { cell: "m448", cycle: "UDDS", temp: 10, title: "m448 UDDS at 10 °C" }, { cell: "m1000", cycle: "UDDS", temp: 10, title: "m1000 UDDS at 10 °C" }] },
  { id: "cycles", title: "Tests 7–8 · Standard vs. non-standard cycles", blurb: "The m1000 cell at 25 °C on the standard HWFET highway cycle and on the two highway profiles the model has never seen in the open data (HWCUST, HWGRADE).", panels: [{ cell: "m1000", cycle: "HWFET", temp: 25, title: "m1000 HWFET at 25 °C" }, { cell: "m1000", cycle: "HWCUST", temp: 25, title: "m1000 HWCUST at 25 °C" }, { cell: "m1000", cycle: "HWGRADE", temp: 25, title: "m1000 HWGRADE at 25 °C" }] },
  { id: "temperature", title: "Test 9 · Temperature", blurb: "Average RMSE at each chamber temperature (m80 cell), then the UDDS cycle at the coldest, freezing and hottest conditions.", panels: [{ cell: "m80", cycle: "UDDS", temp: -20, title: "m80 UDDS at −20 °C" }, { cell: "m80", cycle: "UDDS", temp: 0, title: "m80 UDDS at 0 °C" }, { cell: "m80", cycle: "UDDS", temp: 40, title: "m80 UDDS at 40 °C" }] },
];
// MATLAB figures 6–7: order must match the evaluator (pipeline.py ISOC_CYCLES × ISOCS, OFFSET_CYCLES × OFFSETS)
const ISOC_CYCLES = [{ cycle: "LA92", temp: 25 }, { cycle: "US06", temp: -10 }, { cycle: "US06", temp: 10 }];
const ISOCS = [90, 60, 30];
const OFFSET_CYCLES = [{ cycle: "US06", temp: -10 }, { cycle: "HWFET", temp: 10 }, { cycle: "LA92", temp: 40 }];

const pts = (t: number[], v: number[], shift = 0): Pt[] => t.map((x, i) => ({ t: Math.round((x + shift) * 1000) / 1000, v: v[i] }));
const rmseOfTrace = (t: TimeSeriesTrace) => {
  const e = errorOf(t);
  return e.length ? Math.sqrt(e.reduce((s, x) => s + x * x, 0) / e.length) : NaN;
};

export function FigureGallery({ traces, perCycle, robustness, values, modelName }: { traces: TimeSeriesTrace[]; perCycle: PerCycleRow[]; robustness?: { initialSocRmse: number[]; currentOffsetRmse: number[] } | null; values: Record<MetricKey, number>; modelName: string }) {
  const cycleTraces = traces.filter((t) => (t.group ?? "cycle") === "cycle");
  const find = (cell: string, cycle: string, temp: number) => cycleTraces.find((t) => t.cell === cell && t.temperatureC === temp && (cycle === "charge" ? /charge/i.test(t.cycle) : t.cycle === cycle));
  const rmseFor = (t: TimeSeriesTrace) => {
    const row = perCycle.find((r) => r.cell === t.cell && r.cycle === t.cycle && r.temperatureC === t.temperatureC);
    return row ? `RMSE ${fmtPct(row.rmse, 1)} %` : `RMSE ≈ ${fmtPct(rmseOfTrace(t), 1)} %`;
  };
  const panelOf = (t: TimeSeriesTrace, title: string): PanelSpec => {
    const err = errorOf(t);
    return {
      title,
      run: { cell: t.cell, cycle: t.cycle, temperatureC: t.temperatureC, group: "cycle", blinded: t.blinded },
      soc: t.blinded || !t.actual || !t.estimated ? undefined : [{ label: "Actual", color: CHART.actual, points: pts(t.t, t.actual), width: 1.25 }, { label: "Estimated", color: CHART.estimated, points: pts(t.t, t.estimated) }],
      err: [{ label: "Error", color: CHART.estimated, points: pts(t.t, err) }],
      legend: [{ label: "Estimated", color: CHART.estimated, rmse: rmseFor(t) }],
      note: t.blinded ? "m448 is the blinded cell: its true SOC is the benchmark's answer key and is never published, so the SOC-against-time plot is omitted here. The error curve (estimated minus true SOC) carries the same information about the model without revealing the key." : undefined,
    };
  };

  // figure 6: each cycle restarted at 90 / 60 / 30 % — the three runs end together, so they are aligned on their end (the 90 % run is the longest)
  const isoc = traces.filter((t) => t.group === "initialSoc");
  const isocPanels: PanelSpec[] = ISOC_CYCLES.flatMap(({ cycle, temp }, b) => {
    const runs = ISOCS.map((pct, q) => ({ pct, q, t: isoc.find((x) => x.cycle === cycle && x.temperatureC === temp && x.key.endsWith(`-${pct}`)) })).filter((r) => r.t?.actual && r.t.estimated) as { pct: number; q: number; t: TimeSeriesTrace }[];
    if (!runs.length) return [];
    const end = Math.max(...runs.map((r) => r.t.t[r.t.t.length - 1] ?? 0));
    const shiftOf = (t: TimeSeriesTrace) => end - (t.t[t.t.length - 1] ?? 0);
    const longest = runs.reduce((m, r) => ((r.t.t[r.t.t.length - 1] ?? 0) > (m.t.t[m.t.t.length - 1] ?? 0) ? r : m));
    return [{
      title: `m80 ${cycle} at ${temp} °C`,
      run: { cell: "m80", cycle, temperatureC: temp, group: "initialSoc" },
      soc: [{ label: "Actual", color: CHART.actual, points: pts(longest.t.t, longest.t.actual!, shiftOf(longest.t)), width: 1.25 }, ...runs.map((r) => ({ label: `${r.pct} % start`, color: SERIES[r.q], points: pts(r.t.t, r.t.estimated!, shiftOf(r.t)) }))],
      err: runs.map((r) => ({ label: `${r.pct} % start`, color: SERIES[r.q], points: pts(r.t.t, errorOf(r.t), shiftOf(r.t)) })),
      legend: runs.map((r) => ({ label: `${r.pct} % start`, color: SERIES[r.q], rmse: robustness?.initialSocRmse?.[b * 3 + r.q] !== undefined ? `RMSE ${fmtPct(robustness.initialSocRmse[b * 3 + r.q], 1)} %` : `RMSE ≈ ${fmtPct(rmseOfTrace(r.t), 1)} %` })),
    }];
  });

  // figure 7: each cycle with −0.3 A and +0.3 A added to the measured current
  const offs = traces.filter((t) => t.group === "offset");
  const offsetPanels: PanelSpec[] = OFFSET_CYCLES.flatMap(({ cycle, temp }, b) => {
    const runs = [{ sign: "neg", label: "−0.3 A", j: 0 }, { sign: "pos", label: "+0.3 A", j: 5 }].map((o, i) => ({ ...o, i, t: offs.find((x) => x.cycle === cycle && x.temperatureC === temp && x.key.endsWith(`-${o.sign}`)) })).filter((r) => r.t?.actual && r.t.estimated) as { sign: string; label: string; j: number; i: number; t: TimeSeriesTrace }[];
    if (!runs.length) return [];
    return [{
      title: `m1000 ${cycle} at ${temp} °C`,
      run: { cell: "m1000", cycle, temperatureC: temp, group: "offset" },
      soc: [{ label: "Actual", color: CHART.actual, points: pts(runs[0].t.t, runs[0].t.actual!), width: 1.25 }, ...runs.map((r) => ({ label: r.label, color: SERIES[r.i], points: pts(r.t.t, r.t.estimated!) }))],
      err: runs.map((r) => ({ label: r.label, color: SERIES[r.i], points: pts(r.t.t, errorOf(r.t)) })),
      legend: runs.map((r) => ({ label: r.label, color: SERIES[r.i], rmse: robustness?.currentOffsetRmse?.[b * 6 + r.j] !== undefined ? `RMSE ${fmtPct(robustness.currentOffsetRmse[b * 6 + r.j], 1)} %` : `RMSE ≈ ${fmtPct(rmseOfTrace(r.t), 1)} %` })),
    }];
  });
  const noRobustness = !isoc.length && !offs.length;

  return (
    <div className="space-y-6">
      {CYCLE_FIGURES.map((fig) => {
        const panels = fig.panels.map((p) => ({ p, t: find(p.cell, p.cycle, p.temp) })).filter((x) => x.t).map((x) => panelOf(x.t!, x.p.title));
        if (!panels.length && fig.id !== "temperature") return null;
        return (
          <ChartFrame key={fig.id} title={fig.title} description={fig.blurb}>
            {fig.id === "temperature" ? <div className="mb-4"><TemperatureBars series={[{ name: modelName, values }]} /></div> : null}
            <PanelGrid panels={panels} />
          </ChartFrame>
        );
      })}
      <ChartFrame title="Test 10 · Incorrect initial SOC" description="Three cycles joined at the point where the true SOC has already fallen to 90, 60 or 30 %, with the model assuming a full battery at start-up. Coulomb counting never recovers; voltage-informed estimators converge, and the plot shows how fast. The runs are aligned on their common end.">
        {isocPanels.length ? <PanelGrid panels={isocPanels} /> : <NoRobustness legacy={noRobustness} />}
      </ChartFrame>
      <ChartFrame title="Test 11 · Current-sensor offset" description="Three cycles re-run with a constant ±0.3 A added to the measured current (the offsets that enter the score). Pure current integration drifts linearly; estimators that also use voltage correct it. Below, RMSE against every offset the evaluator sweeps.">
        {offsetPanels.length ? <PanelGrid panels={offsetPanels} /> : <NoRobustness legacy={noRobustness} />}
        {robustness?.currentOffsetRmse?.length ? <div className="mt-4"><OffsetRmseChart currentOffsetRmse={robustness.currentOffsetRmse} perCycle={perCycle} /></div> : null}
      </ChartFrame>
    </div>
  );
}

function NoRobustness({ legacy }: { legacy: boolean }) {
  return <Alert variant="info" title="Robustness traces were not recorded for this result">{legacy ? "This submission was evaluated before the evaluator stored the initial-SOC and sensor-offset traces (2026-08-29). Submit a new version to get these figures." : "The evaluator did not store these runs for this result."}</Alert>;
}

function PanelGrid({ panels }: { panels: PanelSpec[] }) {
  return (
    <div className={`grid gap-4 ${panels.length >= 3 ? "lg:grid-cols-3" : panels.length === 2 ? "md:grid-cols-2" : ""}`}>
      {panels.map((p) => <Panel key={p.title} spec={p} />)}
    </div>
  );
}

/** One subplot column of the MATLAB figure: SOC on top (when the reference SOC is public), error below, legend with RMSE. */
function Panel({ spec }: { spec: PanelSpec }) {
  const all = [...(spec.soc ?? []), ...spec.err].flatMap((l) => l.points);
  const tMax = all.length ? Math.max(...all.map((q) => q.t)) : 1;
  const xDomain: [number, number] = [0, Math.max(0.1, Math.ceil(tMax * 10) / 10)];
  return (
    <div className="min-w-0">
      <p className="font-heading text-sm font-semibold text-ink">{spec.title}</p>
      <RunChips run={spec.run} className="mb-2 mt-1" />
      {spec.soc ? (
        <Mini lines={spec.soc} height={170} xDomain={xDomain} yLabel="SOC" showX={false} />
      ) : (
        <div className="flex h-[170px] items-center gap-3 rounded-brand border border-dashed border-border bg-grey-100/50 px-4 text-xs leading-relaxed text-grey-700">
          <EyeOff className="size-5 shrink-0 text-grey-500" aria-hidden />
          <p><span className="font-heading font-semibold text-ink">No SOC plot for the blinded cell.</span> {spec.note}</p>
        </div>
      )}
      <Mini lines={spec.err} height={130} xDomain={xDomain} yLabel="Error" showX zeroLine />
      <ul className="mt-1 space-y-0.5 text-xs text-grey-800">
        {spec.legend.map((l) => (
          <li key={l.label} className="flex items-center gap-1.5"><span className="inline-block h-0.5 w-4 rounded" style={{ background: l.color }} aria-hidden /> {l.label} <span className="ml-auto font-heading font-semibold tabular text-ink">{l.rmse}</span></li>
        ))}
      </ul>
    </div>
  );
}

function Mini({ lines, height, xDomain, yLabel, showX, zeroLine }: { lines: LineSpec[]; height: number; xDomain: [number, number]; yLabel: string; showX: boolean; zeroLine?: boolean }) {
  const vs = lines.flatMap((l) => l.points.map((q) => q.v));
  let lo = Math.min(...vs), hi = Math.max(...vs);
  if (zeroLine) { lo = Math.min(lo, 0); hi = Math.max(hi, 0); }
  const { domain: yDomain, ticks } = niceAxis(lo, hi);
  const tick = { ...axisProps.tick, fontSize: 10 };
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart margin={{ top: 6, right: 8, left: 0, bottom: showX ? 0 : -8 }}>
        <CartesianGrid {...gridProps} />
        <XAxis dataKey="t" type="number" domain={xDomain} {...axisProps} tick={tick} height={showX ? 22 : 8} tickFormatter={(v) => (showX ? `${v} h` : "")} tickCount={5} allowDataOverflow />
        <YAxis {...axisProps} tick={tick} width={42} unit="%" domain={yDomain} ticks={ticks} label={{ value: yLabel, angle: -90, position: "insideLeft", offset: 12, fontSize: 10, fill: CHART.text }} />
        {lines.map((l) => (
          <Line key={l.label} data={l.points} dataKey="v" name={l.label} stroke={l.color} strokeWidth={l.width ?? 1.5} strokeDasharray={l.dashed ? "4 3" : undefined} dot={false} isAnimationActive={false} />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

/** Axis on round numbers: a 1-2-5 step giving about four intervals, the domain widened to multiples of it. */
function niceAxis(lo: number, hi: number, target = 4): { domain: [number, number]; ticks: number[] } {
  const span = Math.max(hi - lo, 1);
  const raw = span / target;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const r = raw / mag;
  const step = (r < 1.5 ? 1 : r < 3.5 ? 2 : r < 7.5 ? 5 : 10) * mag;
  const a = Math.floor(lo / step) * step;
  const b = Math.ceil(hi / step) * step;
  const ticks: number[] = [];
  for (let v = a; v <= b + 1e-9; v += step) ticks.push(Math.round(v * 1000) / 1000);
  return { domain: [a, b], ticks };
}
