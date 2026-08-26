"use client";

import Link from "next/link";
import { createColumnHelper, type ColumnDef } from "@tanstack/react-table";
import { Lock, EyeOff } from "lucide-react";
import type { LeaderboardRow } from "@/lib/queries";
import { TEST_CASES, MODEL_TYPE_LABELS } from "@/lib/test-cases";
import { fmtPct, fmtDate } from "@/lib/utils";
import { RankBadge } from "./rank-badge";
import { Tooltip } from "@/components/ui/tooltip";
import { Avatar } from "@/components/avatar";

const col = createColumnHelper<LeaderboardRow>();

export const NUMERIC_META = { align: "right" as const };

export function buildColumns(): ColumnDef<LeaderboardRow, unknown>[] {
  const base = [
    col.display({
      id: "rank",
      header: "Rank",
      cell: ({ row }) => <RankBadge rank={row.index + 1} />,
      enableSorting: false,
      enableHiding: false,
      size: 64,
    }),
    col.accessor("modelName", {
      id: "modelName",
      header: "Model",
      enableHiding: false,
      cell: ({ row }) => (
        <div className="min-w-44">
          <Link href={`/submissions/${row.original.id}`} className="font-heading font-semibold text-ink hover:text-maroon hover:underline">
            {row.original.modelName}
          </Link>
          <div className="mt-0.5 flex items-center gap-1.5 text-xs text-grey-600">
            <span>#{row.original.seq}</span>
            <span aria-hidden>·</span>
            <span>{MODEL_TYPE_LABELS[row.original.modelType] ?? row.original.modelType}</span>
            {row.original.isPrivate ? (
              <Tooltip content="Only you can see this row. Make it public from the submission page to appear on the leaderboard.">
                <span className="inline-flex items-center gap-1 rounded-full border border-gold-400 bg-gold-200 px-1.5 py-0.5 font-heading text-[10px] font-semibold uppercase tracking-wide text-grey-900"><Lock className="size-3" /> Private · only you</span>
              </Tooltip>
            ) : null}
            {row.original.isHidden ? (
              <Tooltip content="Hidden by an administrator"><EyeOff className="size-3 text-danger" /></Tooltip>
            ) : null}
          </div>
        </div>
      ),
    }),
    col.accessor("author", {
      id: "author",
      header: "Author",
      cell: ({ row }) => (
        <div className="flex min-w-44 items-center gap-2.5">
          {/* owner first, then collaborators, stacked */}
          <span className="flex shrink-0 items-center">
            <Link href={`/users/${row.original.userId}`} className="rounded-full ring-2 ring-white" title={row.original.author}>
              <Avatar userId={row.original.userId} name={row.original.author} hasAvatar={row.original.avatarVersion !== null} version={row.original.avatarVersion} size={30} />
            </Link>
            {row.original.collaborators.slice(0, 3).map((c) => (
              <Link key={c.id} href={`/users/${c.id}`} className="-ml-2 rounded-full ring-2 ring-white" title={c.name}>
                <Avatar userId={c.id} name={c.name} hasAvatar={c.avatarVersion !== null} version={c.avatarVersion} size={26} />
              </Link>
            ))}
            {row.original.collaborators.length > 3 ? <span className="-ml-2 flex size-[26px] items-center justify-center rounded-full bg-grey-200 font-heading text-[10px] font-semibold text-grey-800 ring-2 ring-white">+{row.original.collaborators.length - 3}</span> : null}
          </span>
          <span className="min-w-0">
            <Link href={`/users/${row.original.userId}`} className="block truncate text-grey-900 hover:text-maroon hover:underline">
              {row.original.author}
              {row.original.collaborators.length ? <span className="text-grey-600"> +{row.original.collaborators.length}</span> : null}
            </Link>
            <span className="block truncate text-xs text-grey-600">{row.original.affiliation}</span>
          </span>
        </div>
      ),
    }),
    col.accessor("submittedAt", {
      id: "submittedAt",
      header: "Submitted",
      cell: (c) => <span className="whitespace-nowrap text-grey-700">{fmtDate(c.getValue())}</span>,
    }),
    col.accessor("weightedError", {
      id: "weightedError",
      header: "Weighted error",
      meta: { ...NUMERIC_META, tooltip: "Weighted mean of the 12 blinded test-case RMSE values (% SOC). Lower is better. See Methodology for weights." },
      cell: (c) => <span className="font-heading font-semibold text-ink tabular">{fmtPct(c.getValue())}</span>,
      enableHiding: false,
    }),
    col.accessor("complexity", {
      id: "complexity",
      header: "Complexity",
      meta: { ...NUMERIC_META, tooltip: "Relative computational cost, 1 (trivial) to 10 (heavy), ±1." },
      cell: ({ row }) => (
        <span className="tabular text-grey-800">
          {row.original.complexity} <span className="text-grey-500">±{row.original.complexityUncertainty}</span>
        </span>
      ),
    }),
  ] as ColumnDef<LeaderboardRow, unknown>[];

  const metrics = TEST_CASES.map((tc) =>
    col.accessor(tc.key, {
      id: tc.key,
      header: tc.short,
      meta: { ...NUMERIC_META, tooltip: `Test ${tc.test} — ${tc.label}. ${tc.description}`, group: tc.group },
      cell: (c) => <span className="tabular">{fmtPct(c.getValue() as number)}</span>,
    }),
  ) as ColumnDef<LeaderboardRow, unknown>[];

  const tail = [
    col.accessor("maxError", {
      id: "maxError",
      header: "Max error",
      meta: { ...NUMERIC_META, tooltip: "Largest instantaneous SOC error across all blinded cycles (% SOC)." },
      cell: (c) => <span className="tabular">{fmtPct(c.getValue())}</span>,
    }),
  ] as ColumnDef<LeaderboardRow, unknown>[];

  return [...base, ...metrics, ...tail];
}

export const DEFAULT_HIDDEN = Object.fromEntries([
  ...TEST_CASES.filter((t) => !t.defaultVisible).map((t) => [t.key, false]),
  ["maxError", false],
]) as Record<string, boolean>;
