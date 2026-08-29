"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus, X, Search, GitCompareArrows, Lock, SlidersHorizontal } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { isCurrentBenchmark } from "@/lib/benchmark-version";
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

export function CompareClient({ rows, initialIds, tracesById, viewerId }: { rows: LeaderboardRow[]; initialIds: string[]; tracesById: Record<string, TimeSeriesTrace[]>; viewerId?: string }) {
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
      {ids.length >= MAX ? (
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-grey-700">Comparing {MAX} models (the maximum).</p>
          <Picker rows={rows} ids={ids} onApply={(next) => apply(next.slice(0, MAX))} viewerId={viewerId} compact />
        </div>
      ) : null}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {selected.map((s, i) => (
          <div key={s.id} className="card flex items-start gap-3 p-4" style={{ borderTopColor: SERIES[i], borderTopWidth: 3 }}>
            <div className="min-w-0 flex-1">
              <p className="truncate font-heading font-semibold text-ink">{s.modelName}{s.isPrivate ? <Lock className="ml-1.5 inline size-3.5 text-[#9a6a17]" aria-label="Private" /> : null}</p>
              <p className="truncate text-xs text-grey-600">{MODEL_TYPE_LABELS[s.modelType]} · {s.author}</p>
              <p className="mt-1 text-sm"><span className="font-heading font-semibold text-ink tabular">{fmtPct(s.weightedError)} %</span> <span className="text-grey-600">weighted</span></p>
            </div>
            <button onClick={() => apply(ids.filter((x) => x !== s.id))} className="rounded-brand p-1 text-grey-500 hover:bg-grey-100 hover:text-ink" aria-label={`Remove ${s.modelName}`}><X className="size-4" /></button>
          </div>
        ))}
        {ids.length < MAX ? <Picker rows={rows} ids={ids} onApply={(next) => apply(next.slice(0, MAX))} viewerId={viewerId} /> : null}
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
          {haveTraces ? <SocTracePicker tracesByModel={selected.map((s) => tracesById[s.id].filter((t) => (t.group ?? "cycle") === "cycle"))} names={selected.map((s) => s.modelName)} /> : null}
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

const MAX = 4;

function Picker({ rows, ids, onApply, viewerId, compact }: { rows: LeaderboardRow[]; ids: string[]; onApply: (ids: string[]) => void; viewerId?: string; compact?: boolean }) {
  const [q, setQ] = React.useState("");
  const [open, setOpen] = React.useState(false);
  const [draft, setDraft] = React.useState<string[]>(ids);
  React.useEffect(() => {
    if (open) setDraft(ids);
  }, [open, ids]);

  // public rank exactly as the leaderboard computes it: current-benchmark, public rows by weighted error
  const rank = React.useMemo(() => {
    const m = new Map<string, number>();
    [...rows].filter((r) => !r.isPrivate && isCurrentBenchmark(r.evaluatorVersion)).sort((a, b) => a.weightedError - b.weightedError).forEach((r, i) => m.set(r.id, i + 1));
    return m;
  }, [rows]);
  const list = rows
    .filter((r) => `${r.modelName} ${r.author} ${r.affiliation} ${MODEL_TYPE_LABELS[r.modelType]}`.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => {
      const la = isCurrentBenchmark(a.evaluatorVersion) ? 0 : 1;
      const lb = isCurrentBenchmark(b.evaluatorVersion) ? 0 : 1;
      return la - lb || a.weightedError - b.weightedError;
    })
    .slice(0, 60);
  const full = draft.length >= MAX;
  const toggle = (id: string) => setDraft((d) => (d.includes(id) ? d.filter((x) => x !== id) : full ? d : [...d, id]));
  const changed = draft.length !== ids.length || draft.some((id) => !ids.includes(id));

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {compact ? (
          <Button variant="outline" size="sm"><SlidersHorizontal /> Change models</Button>
        ) : (
        <button className="flex min-h-24 items-center justify-center gap-2 rounded-brand border-2 border-dashed border-border p-4 font-heading text-sm font-medium text-grey-700 hover:border-maroon hover:text-maroon">
          <Plus className="size-4" /> {ids.length ? `Add or change models (${ids.length} of ${MAX})` : "Choose models to compare"}
        </button>
        )}
      </DialogTrigger>
      <DialogContent title="Choose models to compare" description={`Tick up to ${MAX}. Public evaluated submissions in leaderboard order; your private models are included and marked.`} size="lg">
        <div className="relative mb-3">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-grey-500" />
          <Input autoFocus placeholder="Search model, author, affiliation, type…" value={q} onChange={(e) => setQ(e.target.value)} className="pl-9" />
        </div>
        <ul className="max-h-[50vh] divide-y divide-border overflow-y-auto rounded-brand border border-border">
          {list.map((r) => {
            const on = draft.includes(r.id);
            const disabled = !on && full;
            const rk = rank.get(r.id);
            const legacy = !isCurrentBenchmark(r.evaluatorVersion);
            return (
              <li key={r.id}>
                <label className={cn("flex w-full cursor-pointer items-center gap-3 px-3 py-2.5 text-left", on ? "bg-gold-100/70" : "hover:bg-maroon-100/40", disabled && "cursor-not-allowed opacity-50", r.isPrivate && !on && "bg-[repeating-linear-gradient(135deg,#fdf6e3_0_10px,#fbf0d4_10px_20px)]")}>
                  <Checkbox checked={on} disabled={disabled} onCheckedChange={() => toggle(r.id)} aria-label={`Select ${r.modelName}`} />
                  <span className="w-9 shrink-0 text-center font-heading text-sm font-semibold tabular text-grey-700">{rk ? `#${rk}` : "—"}</span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                      <span className="truncate font-heading font-medium text-ink">{r.modelName}</span>
                      {r.isPrivate ? <span className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full border border-gold-400 bg-gold-200 px-1.5 py-0.5 font-heading text-[10px] font-semibold uppercase tracking-wide text-grey-900"><Lock className="size-3" /> {r.userId === viewerId ? "Private · only you" : "Private"}</span> : null}
                      {legacy ? <span className="inline-flex shrink-0 items-center whitespace-nowrap rounded-full border border-[#f2dcb6] bg-[#fdf4e3] px-1.5 py-0.5 font-heading text-[10px] font-semibold uppercase tracking-wide text-[#7a4f0e]">legacy · unranked</span> : null}
                    </span>
                    <span className="block truncate text-xs text-grey-600">#{r.seq} · {MODEL_TYPE_LABELS[r.modelType]} · {r.author}, {r.affiliation}</span>
                  </span>
                  <span className="shrink-0 font-heading text-sm font-semibold text-ink tabular">{fmtPct(r.weightedError)} %</span>
                </label>
              </li>
            );
          })}
          {list.length === 0 ? <li className="px-2 py-6 text-center text-sm text-grey-600">No models match.</li> : null}
        </ul>
        <div className="mt-3 flex items-center justify-between gap-3">
          <p className="text-sm text-grey-700">{draft.length} of {MAX} selected{full ? " — untick one to pick another" : ""}</p>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setDraft([])} disabled={!draft.length}>Clear</Button>
            <Button onClick={() => { onApply(draft); setOpen(false); setQ(""); }} disabled={!changed}>Compare{draft.length ? ` (${draft.length})` : ""}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export { Button };
