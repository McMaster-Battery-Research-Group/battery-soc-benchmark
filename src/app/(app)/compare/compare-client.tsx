"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus, X, Search, GitCompareArrows } from "lucide-react";
import type { LeaderboardRow } from "@/lib/queries";
import type { TimeSeriesTrace } from "@/evaluator/types";
import { TEST_CASES, MODEL_TYPE_LABELS, type MetricKey } from "@/lib/test-cases";
import { fmtPct, cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/misc";
import { TestCaseBars } from "@/components/charts/test-case-bars";
import { TemperatureBars } from "@/components/charts/temperature-bars";
import { SocTracePicker } from "@/components/charts/soc-trace";
import { SERIES } from "@/components/charts/palette";

export function CompareClient({ rows, initialIds, tracesById }: { rows: LeaderboardRow[]; initialIds: string[]; tracesById: Record<string, TimeSeriesTrace[]> }) {
  const router = useRouter();
  const [ids, setIds] = React.useState<string[]>(initialIds);
  const selected = ids.map((id) => rows.find((r) => r.id === id)!).filter(Boolean);
  const apply = (next: string[]) => {
    setIds(next);
    router.replace(`/compare?ids=${next.join(",")}`, { scroll: false });
  };
  const values = (r: LeaderboardRow) => Object.fromEntries(TEST_CASES.map((t) => [t.key, r[t.key]])) as Record<MetricKey, number>;
  const haveTraces = selected.every((s) => tracesById[s.id]);

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {selected.map((s, i) => (
          <div key={s.id} className="card flex items-start gap-3 p-4" style={{ borderTopColor: SERIES[i], borderTopWidth: 3 }}>
            <div className="min-w-0 flex-1">
              <p className="truncate font-heading font-semibold text-ink">{s.modelName}</p>
              <p className="truncate text-xs text-grey-600">{MODEL_TYPE_LABELS[s.modelType]} · {s.author}</p>
              <p className="mt-1 text-sm"><span className="font-heading font-semibold text-ink tabular">{fmtPct(s.weightedError)} %</span> <span className="text-grey-600">weighted</span></p>
            </div>
            <button onClick={() => apply(ids.filter((x) => x !== s.id))} className="rounded-brand p-1 text-grey-500 hover:bg-grey-100 hover:text-ink" aria-label={`Remove ${s.modelName}`}><X className="size-4" /></button>
          </div>
        ))}
        {ids.length < 4 ? <Picker rows={rows.filter((r) => !ids.includes(r.id))} onPick={(id) => apply([...ids, id])} slot={ids.length + 1} /> : null}
      </div>

      {selected.length < 2 ? (
        <EmptyState
          icon={GitCompareArrows}
          title="Select at least two models"
          description="Use the picker above to add models from the leaderboard, or start with the current top three. The URL updates so you can share any comparison."
          action={
            <Button variant="secondary" onClick={() => apply([...rows].sort((a, b) => a.weightedError - b.weightedError).slice(0, 3).map((r) => r.id))}>
              Compare the top 3 models
            </Button>
          }
        />
      ) : (
        <>
          <div className="card overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-grey-100">
                <tr className="border-b border-border">
                  <th className="h-10 px-3 text-left font-heading text-xs font-semibold uppercase tracking-wide text-grey-800">Metric</th>
                  {selected.map((s, i) => (
                    <th key={s.id} className="h-10 px-3 text-right font-heading text-xs font-semibold uppercase tracking-wide text-grey-800">
                      <span className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-sm" style={{ background: SERIES[i] }} />{s.modelName}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <MetricRow label="Weighted error" vals={selected.map((s) => s.weightedError)} bold />
                <MetricRow label="Complexity" vals={selected.map((s) => s.complexity)} fmt={(v) => String(v)} lowerBetter={false} />
                <MetricRow label="Max error" vals={selected.map((s) => s.maxError)} />
                {TEST_CASES.map((t) => (
                  <MetricRow key={t.key} label={<><span className="mr-1.5 text-xs text-grey-500">T{t.test}</span>{t.label}</>} vals={selected.map((s) => s[t.key])} />
                ))}
              </tbody>
            </table>
          </div>
          <TestCaseBars series={selected.map((s) => ({ name: s.modelName, values: values(s) }))} />
          <TemperatureBars series={selected.map((s) => ({ name: s.modelName, values: values(s) }))} />
          {haveTraces ? <SocTracePicker tracesByModel={selected.map((s) => tracesById[s.id])} names={selected.map((s) => s.modelName)} /> : null}
        </>
      )}
    </div>
  );
}

function MetricRow({ label, vals, bold, fmt = (v) => `${fmtPct(v)} %`, lowerBetter = true }: { label: React.ReactNode; vals: number[]; bold?: boolean; fmt?: (v: number) => string; lowerBetter?: boolean }) {
  const best = lowerBetter ? Math.min(...vals) : NaN;
  return (
    <tr className="border-b border-border">
      <td className={cn("px-3 py-2 text-grey-800", bold && "font-heading font-semibold text-ink")}>{label}</td>
      {vals.map((v, i) => (
        <td key={i} className={cn("px-3 py-2 text-right tabular", bold && "font-heading font-semibold", v === best && lowerBetter && "bg-gold-100 text-ink")}>
          {fmt(v)}
          {v === best && lowerBetter && vals.length > 1 ? <span className="sr-only"> (best)</span> : null}
        </td>
      ))}
    </tr>
  );
}

function Picker({ rows, onPick, slot }: { rows: LeaderboardRow[]; onPick: (id: string) => void; slot: number }) {
  const [q, setQ] = React.useState("");
  const [open, setOpen] = React.useState(false);
  const list = rows.filter((r) => `${r.modelName} ${r.author} ${r.affiliation} ${MODEL_TYPE_LABELS[r.modelType]}`.toLowerCase().includes(q.toLowerCase())).sort((a, b) => a.weightedError - b.weightedError).slice(0, 40);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button className="flex min-h-24 items-center justify-center gap-2 rounded-brand border-2 border-dashed border-border p-4 font-heading text-sm font-medium text-grey-700 hover:border-maroon hover:text-maroon">
          <Plus className="size-4" /> Add model {slot}
        </button>
      </DialogTrigger>
      <DialogContent title="Choose a model" description="Public evaluated submissions, best weighted error first." size="lg">
        <div className="relative mb-3">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-grey-500" />
          <Input autoFocus placeholder="Search model, author, affiliation, type…" value={q} onChange={(e) => setQ(e.target.value)} className="pl-9" />
        </div>
        <ul className="max-h-[55vh] divide-y divide-border overflow-y-auto">
          {list.map((r) => (
            <li key={r.id}>
              <button onClick={() => { onPick(r.id); setOpen(false); setQ(""); }} className="flex w-full items-center justify-between gap-3 px-2 py-2.5 text-left hover:bg-maroon-100/60">
                <span className="min-w-0">
                  <span className="block truncate font-heading font-medium text-ink">{r.modelName}</span>
                  <span className="block truncate text-xs text-grey-600">{MODEL_TYPE_LABELS[r.modelType]} · {r.author}, {r.affiliation}</span>
                </span>
                <span className="shrink-0 font-heading text-sm font-semibold text-ink tabular">{fmtPct(r.weightedError)} %</span>
              </button>
            </li>
          ))}
          {list.length === 0 ? <li className="px-2 py-6 text-center text-sm text-grey-600">No models match.</li> : null}
        </ul>
      </DialogContent>
    </Dialog>
  );
}

export { Button };
