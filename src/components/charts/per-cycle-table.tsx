"use client";

import * as React from "react";
import type { PerCycleRow } from "@/evaluator/types";
import { CELLS, DRIVE_CYCLES, TEMPERATURES_C } from "@/lib/test-cases";
import { fmtPct, toCsv } from "@/lib/utils";
import { NativeSelect, Label } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
import { SEQUENTIAL } from "./palette";

/** The 132-row error summary (RMSE / MAE / MAXE per blinded cycle) with filters and a heat tint. */
export function PerCycleTable({ rows, modelName }: { rows: PerCycleRow[]; modelName: string }) {
  const [cell, setCell] = React.useState("");
  const [temp, setTemp] = React.useState("");
  const [cycle, setCycle] = React.useState("");
  const filtered = rows.filter((r) => (!cell || r.cell === cell) && (!temp || String(r.temperatureC) === temp) && (!cycle || r.cycle === cycle));
  const max = Math.max(...rows.map((r) => r.rmse));
  const tint = (v: number) => SEQUENTIAL[Math.min(SEQUENTIAL.length - 1, Math.floor((v / max) * (SEQUENTIAL.length - 1)))];

  const download = () => {
    const csv = toCsv(filtered as unknown as Record<string, unknown>[], [
      { key: "cell", header: "Cell" }, { key: "temperatureC", header: "Temperature (C)" }, { key: "cycle", header: "Cycle" },
      { key: "rmse", header: "RMSE (%)" }, { key: "mae", header: "MAE (%)" }, { key: "maxErr", header: "MAXE (%)" }, { key: "durationH", header: "Duration (h)" },
    ]);
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = `${modelName.replace(/[^a-z0-9]+/gi, "_")}-per-cycle.csv`;
    a.click();
  };

  return (
    <div className="card">
      <div className="flex flex-col gap-3 border-b border-border p-4 md:flex-row md:items-end md:justify-between">
        <div className="grid grid-cols-3 gap-3">
          <div><Label htmlFor="pc-cell">Cell</Label><NativeSelect id="pc-cell" value={cell} onChange={(e) => setCell(e.target.value)} className="h-9 text-sm"><option value="">All</option>{CELLS.map((c) => <option key={c}>{c}</option>)}</NativeSelect></div>
          <div><Label htmlFor="pc-temp">Temperature</Label><NativeSelect id="pc-temp" value={temp} onChange={(e) => setTemp(e.target.value)} className="h-9 text-sm"><option value="">All</option>{TEMPERATURES_C.map((t) => <option key={t} value={t}>{t} °C</option>)}</NativeSelect></div>
          <div><Label htmlFor="pc-cycle">Cycle</Label><NativeSelect id="pc-cycle" value={cycle} onChange={(e) => setCycle(e.target.value)} className="h-9 text-sm"><option value="">All</option>{DRIVE_CYCLES.map((c) => <option key={c}>{c}</option>)}</NativeSelect></div>
        </div>
        <Button variant="outline" size="sm" onClick={download}><Download /> CSV ({filtered.length})</Button>
      </div>
      <div className="max-h-[480px] overflow-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-grey-100">
            <tr className="border-b border-border">
              {["Cell", "Temp.", "Cycle", "Duration", "RMSE", "MAE", "MAXE"].map((h, i) => (
                <th key={h} className={`h-10 px-3 font-heading text-xs font-semibold uppercase tracking-wide text-grey-800 ${i >= 3 ? "text-right" : "text-left"}`}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <tr key={`${r.cell}-${r.temperatureC}-${r.cycle}`} className="border-b border-border">
                <td className="px-3 py-2">{r.cell}</td>
                <td className="px-3 py-2 tabular">{r.temperatureC} °C</td>
                <td className="px-3 py-2">{r.cycle}</td>
                <td className="px-3 py-2 text-right tabular text-grey-700">{r.durationH.toFixed(2)} h</td>
                <td className="px-3 py-2 text-right tabular">
                  <span className="inline-flex min-w-16 items-center justify-end gap-2">
                    <span className="inline-block size-2.5 rounded-sm" style={{ background: tint(r.rmse) }} aria-hidden />
                    <span className="font-heading font-semibold text-ink">{fmtPct(r.rmse)}</span>
                  </span>
                </td>
                <td className="px-3 py-2 text-right tabular">{fmtPct(r.mae)}</td>
                <td className="px-3 py-2 text-right tabular">{fmtPct(r.maxErr)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
