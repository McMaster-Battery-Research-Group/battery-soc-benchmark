"use client";

import * as React from "react";
import Link from "next/link";
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type SortingState,
  type VisibilityState,
} from "@tanstack/react-table";
import { ArrowUpDown, ArrowUp, ArrowDown, Columns3, Download, Search, Info, ChevronLeft, ChevronRight } from "lucide-react";
import type { LeaderboardRow } from "@/lib/queries";
import { TEST_CASES, GROUP_LABELS, MODEL_TYPE_LABELS, type TestCaseGroup } from "@/lib/test-cases";
import { cn, toCsv, fmtPct, fmtDate } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input, NativeSelect, Label } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/dropdown";
import { Tooltip, TooltipProvider } from "@/components/ui/tooltip";
import { EmptyState } from "@/components/ui/misc";
import { buildColumns, DEFAULT_HIDDEN } from "./columns";
import { RankBadge } from "./rank-badge";
import { isCurrentBenchmark } from "@/lib/benchmark-version";

const STORAGE_KEY = "socbench.leaderboard.columns";

export function LeaderboardTable({
  rows,
  viewerId,
  compact = false,
  title = "leaderboard",
}: {
  rows: LeaderboardRow[];
  viewerId?: string | null;
  compact?: boolean;
  title?: string;
}) {
  const columns = React.useMemo(() => buildColumns(), []);
  const [sorting, setSorting] = React.useState<SortingState>([{ id: "weightedError", desc: false }]);
  const [visibility, setVisibility] = React.useState<VisibilityState>(DEFAULT_HIDDEN);
  const [author, setAuthor] = React.useState("");
  const [affiliation, setAffiliation] = React.useState("");
  const [modelType, setModelType] = React.useState("");
  const [showPrivate, setShowPrivate] = React.useState(false); // opt-in: the public board is what everyone else sees
  const [showLegacy, setShowLegacy] = React.useState(true); // legacy-scored rows are listed (unranked) unless filtered out

  React.useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) setVisibility({ ...DEFAULT_HIDDEN, ...JSON.parse(saved) });
    } catch {}
  }, []);
  const updateVisibility = (v: VisibilityState | ((old: VisibilityState) => VisibilityState)) => {
    setVisibility((old) => {
      const next = typeof v === "function" ? v(old) : v;
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {}
      return next;
    });
  };

  const filtered = React.useMemo(
    () =>
      rows.filter(
        (r) =>
          (!author || r.author.toLowerCase().includes(author.toLowerCase())) &&
          (!affiliation || r.affiliation.toLowerCase().includes(affiliation.toLowerCase())) &&
          (!modelType || r.modelType === modelType) &&
          (showPrivate || !r.isPrivate) &&
          (showLegacy || isCurrentBenchmark(r.evaluatorVersion)),
      ),
    [rows, author, affiliation, modelType, showPrivate, showLegacy],
  );

  // Rank is derived from the weighted error, independent of the current sort, and counted over
  // PUBLIC rows only — so it matches what everyone else sees. A viewer's own private model gets a
  // "would rank here" ghost position without displacing anyone.
  const rankById = React.useMemo(() => {
    const m = new Map<string, { rank: number; ghost: boolean; unranked: boolean }>();
    // Only public rows scored by the CURRENT benchmark are ranked; legacy-scored rows stay listed but unranked.
    const current = filtered.filter((r) => isCurrentBenchmark(r.evaluatorVersion));
    const pub = current.filter((r) => !r.isPrivate).sort((a, b) => a.weightedError - b.weightedError);
    pub.forEach((r, i) => m.set(r.id, { rank: i + 1, ghost: false, unranked: false }));
    for (const r of current) if (r.isPrivate) m.set(r.id, { rank: pub.filter((p) => p.weightedError < r.weightedError).length + 1, ghost: true, unranked: false });
    for (const r of filtered) if (!m.has(r.id)) m.set(r.id, { rank: 0, ghost: false, unranked: true });
    return m;
  }, [filtered]);

  const table = useReactTable({
    data: filtered,
    columns,
    state: { sorting, columnVisibility: visibility },
    onSortingChange: setSorting,
    onColumnVisibilityChange: updateVisibility,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize: compact ? 10 : 25 } },
  });

  const download = () => {
    const cols = table.getVisibleLeafColumns().filter((c) => c.id !== "rank").map((c) => ({ key: c.id, header: typeof c.columnDef.header === "string" ? c.columnDef.header : c.id }));
    const data = table.getSortedRowModel().rows.map((r) => ({ rank: rankById.get(r.original.id)?.unranked ? "unranked (legacy scoring)" : rankById.get(r.original.id)?.ghost ? `~${rankById.get(r.original.id)?.rank} (private)` : rankById.get(r.original.id)?.rank, ...r.original }));
    const csv = toCsv(data, [{ key: "rank", header: "Rank" }, ...cols, { key: "affiliation", header: "Affiliation" }]);
    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `soc-benchmark-${title}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const hasPrivate = viewerId ? rows.some((r) => r.isPrivate && r.userId === viewerId) : false;
  const legacyCount = rows.filter((r) => !isCurrentBenchmark(r.evaluatorVersion)).length;
  const modelTypes = Array.from(new Set(rows.map((r) => r.modelType)));

  return (
    <TooltipProvider>
      <div className="card overflow-hidden">
        {/* Filters: row 1 = search fields (equal columns), row 2 = toggles left / actions right */}
        <div className="space-y-3 border-b border-border p-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <Label htmlFor="f-author">Author</Label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-grey-500" />
                <Input id="f-author" placeholder="Search authors…" value={author} onChange={(e) => setAuthor(e.target.value)} className="pl-9" />
              </div>
            </div>
            <div>
              <Label htmlFor="f-aff">Affiliation</Label>
              <Input id="f-aff" placeholder="Search affiliations…" value={affiliation} onChange={(e) => setAffiliation(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="f-type">Model type</Label>
              <NativeSelect id="f-type" value={modelType} onChange={(e) => setModelType(e.target.value)}>
                <option value="">All model types</option>
                {modelTypes.map((t) => (
                  <option key={t} value={t}>{MODEL_TYPE_LABELS[t] ?? t}</option>
                ))}
              </NativeSelect>
            </div>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-grey-800">
              {hasPrivate ? (
                <label className="flex items-center gap-2">
                  <Checkbox checked={showPrivate} onCheckedChange={(v) => setShowPrivate(!!v)} /> Show my private models <span className="text-grey-500">(only you see them)</span>
                </label>
              ) : null}
              {legacyCount ? (
                <Tooltip content="Submissions scored by an older benchmark version. They are never ranked; untick to hide them.">
                  <label className="flex items-center gap-2">
                    <Checkbox checked={showLegacy} onCheckedChange={(v) => setShowLegacy(!!v)} /> Include legacy-scored <span className="text-grey-500">({legacyCount}, unranked)</span>
                  </label>
                </Tooltip>
              ) : null}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <ColumnPicker visibility={visibility} onChange={updateVisibility} />
              <Button variant="outline" size="sm" onClick={download}><Download /> CSV</Button>
            </div>
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="p-6">
            <EmptyState title="No submissions match" description="Try clearing the filters." />
          </div>
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-sm">
                <thead className="sticky top-0 z-10 bg-grey-100">
                  {table.getHeaderGroups().map((hg) => (
                    <tr key={hg.id} className="border-b border-border">
                      {hg.headers.map((h) => {
                        const meta = (h.column.columnDef.meta ?? {}) as { align?: "right"; tooltip?: string };
                        const sorted = h.column.getIsSorted();
                        return (
                          <th
                            key={h.id}
                            className={cn("h-11 whitespace-nowrap px-3 font-heading text-xs font-semibold uppercase tracking-wide text-grey-800", meta.align === "right" ? "text-right" : "text-left", h.column.id === "modelName" && "sticky left-0 z-20 bg-grey-100")}
                            aria-sort={sorted === "asc" ? "ascending" : sorted === "desc" ? "descending" : undefined}
                          >
                            {h.column.getCanSort() ? (
                              <button className={cn("inline-flex items-center gap-1 hover:text-maroon", meta.align === "right" && "flex-row-reverse")} onClick={h.column.getToggleSortingHandler()}>
                                {flexRender(h.column.columnDef.header, h.getContext())}
                                {sorted === "asc" ? <ArrowUp className="size-3.5" /> : sorted === "desc" ? <ArrowDown className="size-3.5" /> : <ArrowUpDown className="size-3.5 text-grey-400" />}
                                {meta.tooltip ? (
                                  <Tooltip content={meta.tooltip}><Info className="size-3.5 text-grey-400" /></Tooltip>
                                ) : null}
                              </button>
                            ) : (
                              flexRender(h.column.columnDef.header, h.getContext())
                            )}
                          </th>
                        );
                      })}
                    </tr>
                  ))}
                </thead>
                <tbody>
                  {table.getRowModel().rows.map((row) => (
                    <tr
                      key={row.id}
                      className={cn(
                        "border-b border-border transition-colors hover:bg-maroon-100/50",
                        row.original.isPrivate ? "border-l-4 border-l-gold-400 bg-[repeating-linear-gradient(135deg,#fdf6e3_0_10px,#fbf0d4_10px_20px)]" : row.original.userId === viewerId && "bg-[#fffaef]",
                      )}
                      title={row.original.isPrivate ? "Private — visible only to you; not on the public leaderboard" : undefined}
                    >
                      {row.getVisibleCells().map((cell) => {
                        const meta = (cell.column.columnDef.meta ?? {}) as { align?: "right" };
                        return (
                          <td key={cell.id} className={cn("px-3 py-3 align-middle", meta.align === "right" && "text-right", cell.column.id === "rank" && "pl-4", cell.column.id === "modelName" && "sticky left-0 z-[1] pr-4", cell.column.id === "modelName" && (row.original.isPrivate ? "bg-[#fdf6e3]" : row.original.userId === viewerId ? "bg-[#fffaef]" : "bg-white"))}>
                            {cell.column.id === "rank" ? <RankBadge rank={rankById.get(row.original.id)!.rank} ghost={rankById.get(row.original.id)!.ghost} unranked={rankById.get(row.original.id)!.unranked} /> : flexRender(cell.column.columnDef.cell, cell.getContext())}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <ul className="divide-y divide-border md:hidden">
              {table.getRowModel().rows.map((row) => {
                const r = row.original;
                return (
                  <li key={r.id} className={cn("flex items-start gap-3 p-4", r.isPrivate && "border-l-4 border-l-gold-400 bg-[repeating-linear-gradient(135deg,#fdf6e3_0_10px,#fbf0d4_10px_20px)]")}>
                    <RankBadge rank={rankById.get(r.id)!.rank} ghost={rankById.get(r.id)!.ghost} unranked={rankById.get(r.id)!.unranked} />
                    <div className="min-w-0 flex-1">
                      <Link href={`/submissions/${r.id}`} className="font-heading font-semibold text-ink">{r.modelName}</Link>
                      {r.isPrivate ? <span className="ml-2 inline-flex items-center gap-1 rounded-full border border-gold-400 bg-gold-200 px-1.5 py-0.5 font-heading text-[10px] font-semibold uppercase tracking-wide text-grey-900">Private · only you</span> : null}
                      <p className="text-xs text-grey-600">{MODEL_TYPE_LABELS[r.modelType]} · {r.author}, {r.affiliation} · {fmtDate(r.submittedAt)}</p>
                      <dl className="mt-2 grid grid-cols-3 gap-2 text-xs">
                        <div><dt className="text-grey-600">Weighted</dt><dd className="font-heading font-semibold text-ink tabular">{fmtPct(r.weightedError)}</dd></div>
                        <div><dt className="text-grey-600">All cells</dt><dd className="tabular">{fmtPct(r.allCells)}</dd></div>
                        <div><dt className="text-grey-600">−20 °C</dt><dd className="tabular">{fmtPct(r.tempM20)}</dd></div>
                      </dl>
                    </div>
                  </li>
                );
              })}
            </ul>

            {/* Pagination */}
            <div className="flex flex-col items-center justify-between gap-3 border-t border-border px-4 py-3 text-sm text-grey-700 sm:flex-row">
              <span>
                Showing {table.getState().pagination.pageIndex * table.getState().pagination.pageSize + 1}–
                {Math.min((table.getState().pagination.pageIndex + 1) * table.getState().pagination.pageSize, filtered.length)} of {filtered.length}
              </span>
              <div className="flex items-center gap-2">
                <NativeSelect value={table.getState().pagination.pageSize} onChange={(e) => table.setPageSize(Number(e.target.value))} className="h-8 w-24 text-sm" aria-label="Rows per page">
                  {[10, 25, 50, 100].map((n) => <option key={n} value={n}>{n} rows</option>)}
                </NativeSelect>
                <Button variant="outline" size="sm" onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()} aria-label="Previous page"><ChevronLeft /></Button>
                <span className="tabular">Page {table.getState().pagination.pageIndex + 1} of {Math.max(1, table.getPageCount())}</span>
                <Button variant="outline" size="sm" onClick={() => table.nextPage()} disabled={!table.getCanNextPage()} aria-label="Next page"><ChevronRight /></Button>
              </div>
            </div>
          </>
        )}
      </div>
    </TooltipProvider>
  );
}

function ColumnPicker({ visibility, onChange }: { visibility: VisibilityState; onChange: (v: VisibilityState) => void }) {
  const groups: TestCaseGroup[] = ["overview", "conditions", "temperature", "robustness"];
  const isOn = (k: string) => visibility[k] !== false;
  const set = (keys: string[], on: boolean) => onChange({ ...visibility, ...Object.fromEntries(keys.map((k) => [k, on])) });
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm"><Columns3 /> Columns</Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 max-h-[70vh] overflow-y-auto">
        <div className="mb-2 flex items-center justify-between">
          <p className="font-heading text-sm font-semibold text-ink">Test-case columns</p>
          <div className="flex gap-2 text-xs">
            <button className="text-maroon underline" onClick={() => set([...TEST_CASES.map((t) => t.key), "maxError"], true)}>All</button>
            <button className="text-maroon underline" onClick={() => onChange(DEFAULT_HIDDEN)}>Default</button>
          </div>
        </div>
        {groups.map((g) => (
          <fieldset key={g} className="mb-3">
            <legend className="mb-1 font-heading text-xs font-semibold uppercase tracking-wide text-grey-600">{GROUP_LABELS[g]}</legend>
            <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
              {TEST_CASES.filter((t) => t.group === g).map((t) => (
                <label key={t.key} className="flex items-center gap-2 text-sm text-grey-900">
                  <Checkbox checked={isOn(t.key)} onCheckedChange={(v) => set([t.key], !!v)} /> {t.label}
                </label>
              ))}
            </div>
          </fieldset>
        ))}
        <fieldset>
          <legend className="mb-1 font-heading text-xs font-semibold uppercase tracking-wide text-grey-600">Other</legend>
          <label className="flex items-center gap-2 text-sm text-grey-900"><Checkbox checked={isOn("maxError")} onCheckedChange={(v) => set(["maxError"], !!v)} /> Max error</label>
          <label className="mt-1.5 flex items-center gap-2 text-sm text-grey-900"><Checkbox checked={isOn("complexity")} onCheckedChange={(v) => set(["complexity"], !!v)} /> Complexity</label>
          <label className="mt-1.5 flex items-center gap-2 text-sm text-grey-900"><Checkbox checked={isOn("submittedAt")} onCheckedChange={(v) => set(["submittedAt"], !!v)} /> Submitted date</label>
        </fieldset>
      </PopoverContent>
    </Popover>
  );
}
