"use client";

import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { PerCycleRow } from "@/evaluator/types";
import { fmtPct } from "@/lib/utils";
import { SERIES } from "./palette";
import { ChartFrame, ChartTooltip, axisProps, gridProps } from "./chart-primitives";

/** Order must match the evaluator (pipeline.py): OFFSET_CYCLES × OFFSETS. */
const CYCLES = [
  { label: "US06 at −10 °C", cell: "m1000", cycle: "US06", temp: -10 },
  { label: "HWFET at 10 °C", cell: "m1000", cycle: "HWFET", temp: 10 },
  { label: "LA92 at 40 °C", cell: "m1000", cycle: "LA92", temp: 40 },
];
const OFFSETS = [-0.3, -0.1, -0.05, 0.05, 0.1, 0.3];

/**
 * RMSE against current-sensor offset (test 11), one line per re-run cycle — the original tool's
 * "RMSE with Current Sensor Offsets" figure. The 0 A point is the cycle's unmodified RMSE from the
 * per-cycle table. A flat line means the model corrects the bias; a V shape means it integrates it.
 */
export function OffsetRmseChart({ currentOffsetRmse, perCycle }: { currentOffsetRmse: number[]; perCycle: PerCycleRow[] }) {
  if (currentOffsetRmse.length < 18) return null;
  const base = CYCLES.map((c) => perCycle.find((r) => r.cell === c.cell && r.cycle === c.cycle && r.temperatureC === c.temp)?.rmse ?? null);
  const xs = [-0.3, -0.1, -0.05, 0, 0.05, 0.1, 0.3];
  const data = xs.map((x) => {
    const row: Record<string, number | null> = { x };
    CYCLES.forEach((c, b) => {
      row[`s${b}`] = x === 0 ? base[b] : currentOffsetRmse[b * 6 + OFFSETS.indexOf(x)];
    });
    return row;
  });
  return (
    <ChartFrame title="RMSE vs. sensor offset" description="Test 11 — the same three cycles re-run with a constant current offset; 0 A is the unmodified run. Only ±0.3 A enters the score." legend={CYCLES.map((c, b) => ({ label: c.label, color: SERIES[b] }))}>
      <ResponsiveContainer width="100%" height={260}>
        <LineChart data={data} margin={{ top: 12, right: 16, left: 0, bottom: 4 }}>
          <CartesianGrid {...gridProps} />
          <XAxis dataKey="x" type="number" domain={[-0.32, 0.32]} ticks={xs} tickFormatter={(v) => `${v > 0 ? "+" : ""}${v}`} {...axisProps} label={{ value: "current offset (A)", position: "insideBottom", offset: -2, fontSize: 11, fill: "#6d7a84" }} height={34} />
          <YAxis {...axisProps} width={44} unit="%" />
          <Tooltip content={({ active, payload, label }) => <ChartTooltip active={active} label={`${Number(label) > 0 ? "+" : ""}${label} A`} rows={(payload ?? []).map((p, i) => ({ name: CYCLES[i]?.label ?? String(p.name), value: `${fmtPct(Number(p.value))} %`, color: String(p.stroke) }))} />} />
          {CYCLES.map((c, b) => (
            <Line key={b} type="monotone" dataKey={`s${b}`} name={c.label} stroke={SERIES[b]} strokeWidth={2} dot={{ r: 3 }} isAnimationActive={false} />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}
