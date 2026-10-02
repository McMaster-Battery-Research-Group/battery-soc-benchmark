"use client";

import * as React from "react";
import { Area, CartesianGrid, ComposedChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export type ResourceSeries = {
  peakMemMb: number;
  meanMemMb: number;
  limitMemMb: number;
  peakCpuPct: number;
  meanCpuPct: number;
  limitCpuPct: number;
  samples: number;
  series?: { stepSec: number; mem: number[]; cpu: number[] };
};

const MAROON = "#7A003C";
const GOLD = "#B8860B";

function mmss(sec: number) {
  const m = Math.floor(sec / 60);
  return m >= 60 ? `${Math.floor(m / 60)}h${String(m % 60).padStart(2, "0")}` : `${m}m`;
}

/**
 * Administrator view of what the sandbox consumed while this submission was evaluated.
 * Memory against its container limit, CPU as a percentage of one core. Shown to admins only:
 * it describes the evaluation host, not the model, and is used to size the machine.
 */
export function ResourceChart({ usage }: { usage: ResourceSeries }) {
  const s = usage.series;
  const data = React.useMemo(() => {
    if (!s?.mem?.length) return [];
    return s.mem.map((m, i) => ({ t: i * s.stepSec, mem: m, cpu: s.cpu[i] ?? 0 }));
  }, [s]);

  const memPct = Math.round((usage.peakMemMb / Math.max(1, usage.limitMemMb)) * 100);
  const cpuPct = Math.round((usage.peakCpuPct / Math.max(1, usage.limitCpuPct)) * 100);

  return (
    <section className="card mt-6 p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-heading text-lg font-semibold">Sandbox resource use</h2>
        <span className="text-xs text-grey-600">Administrators only · {usage.samples} samples</span>
      </div>
      <p className="mt-1 max-w-prose text-sm text-grey-600">
        What this evaluation actually consumed inside its container. Used to size the evaluation host: a peak well
        below the limit means containers could be smaller, letting more run at once.
      </p>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="rounded-brand border border-border p-3">
          <p className="font-heading text-xs font-semibold uppercase tracking-wide text-grey-600">Peak memory</p>
          <p className="mt-0.5 font-heading text-xl font-bold tabular">
            {Math.round(usage.peakMemMb)} <span className="text-sm font-medium text-grey-600">of {usage.limitMemMb} MB · {memPct} %</span>
          </p>
          <p className="text-xs text-grey-600">mean {Math.round(usage.meanMemMb)} MB</p>
        </div>
        <div className="rounded-brand border border-border p-3">
          <p className="font-heading text-xs font-semibold uppercase tracking-wide text-grey-600">Peak CPU</p>
          <p className="mt-0.5 font-heading text-xl font-bold tabular">
            {Math.round(usage.peakCpuPct)} <span className="text-sm font-medium text-grey-600">of {usage.limitCpuPct} % · {cpuPct} %</span>
          </p>
          <p className="text-xs text-grey-600">mean {Math.round(usage.meanCpuPct)} % · 100 % is one core</p>
        </div>
      </div>

      {data.length > 1 ? (
        <>
          {/* two charts, not two axes: memory in MB and CPU in percent share no scale */}
          <div className="mt-4 h-44 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={data} margin={{ top: 10, right: 58, bottom: 0, left: 0 }}>
                <CartesianGrid stroke="#E6E6E8" vertical={false} />
                <XAxis dataKey="t" tickFormatter={mmss} tick={{ fontSize: 11, fill: "#495965" }} stroke="#B9B9BC" />
                <YAxis
                  tick={{ fontSize: 11, fill: "#495965" }}
                  stroke="#B9B9BC"
                  domain={[0, Math.max(usage.limitMemMb, Math.ceil(usage.peakMemMb * 1.15))]}
                  label={{ value: "Memory (MB)", angle: -90, position: "insideLeft", style: { fontSize: 11, fill: "#495965" } }}
                />
                <Tooltip
                  contentStyle={{ fontSize: 12, borderRadius: 6, border: "1px solid #DBDBDD" }}
                  labelFormatter={(t) => `at ${mmss(Number(t))}`}
                  formatter={(v) => [`${Math.round(Number(v))} MB`, "Memory"] as [string, string]}
                />
                <ReferenceLine
                  y={usage.limitMemMb}
                  stroke={MAROON}
                  strokeDasharray="4 3"
                  label={{ value: `limit ${usage.limitMemMb}`, position: "right", style: { fontSize: 10, fill: MAROON } }}
                />
                <Area type="monotone" dataKey="mem" name="Memory" stroke={MAROON} fill={MAROON} fillOpacity={0.16} strokeWidth={2} dot={false} isAnimationActive={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          <div className="mt-2 h-44 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={data} margin={{ top: 10, right: 58, bottom: 4, left: 0 }}>
                <CartesianGrid stroke="#E6E6E8" vertical={false} />
                <XAxis
                  dataKey="t"
                  tickFormatter={mmss}
                  tick={{ fontSize: 11, fill: "#495965" }}
                  stroke="#B9B9BC"
                  label={{ value: "Time into the evaluation", position: "insideBottom", offset: -2, style: { fontSize: 11, fill: "#495965" } }}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: "#495965" }}
                  stroke="#B9B9BC"
                  domain={[0, Math.max(usage.limitCpuPct, Math.ceil(usage.peakCpuPct * 1.15))]}
                  label={{ value: "CPU (% of one core)", angle: -90, position: "insideLeft", style: { fontSize: 11, fill: "#495965" } }}
                />
                <Tooltip
                  contentStyle={{ fontSize: 12, borderRadius: 6, border: "1px solid #DBDBDD" }}
                  labelFormatter={(t) => `at ${mmss(Number(t))}`}
                  formatter={(v) => [`${Math.round(Number(v))} %`, "CPU"] as [string, string]}
                />
                <ReferenceLine
                  y={usage.limitCpuPct}
                  stroke={GOLD}
                  strokeDasharray="4 3"
                  label={{ value: `limit ${usage.limitCpuPct}`, position: "right", style: { fontSize: 10, fill: GOLD } }}
                />
                <Area type="monotone" dataKey="cpu" name="CPU" stroke={GOLD} fill={GOLD} fillOpacity={0.16} strokeWidth={2} dot={false} isAnimationActive={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <p className="mt-1 text-xs text-grey-600">
            One point every {s!.stepSec} s. Dashed lines are the container limits; 100 % CPU is one core fully busy.
          </p>
        </>
      ) : (
        <p className="mt-3 text-sm text-grey-600">
          No per-sample series for this run: it finished before the first sample, or predates this measurement.
        </p>
      )}
    </section>
  );
}
