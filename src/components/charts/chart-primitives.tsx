"use client";

import * as React from "react";
import { CHART } from "./palette";
import { cn } from "@/lib/utils";

/** Shared tooltip card for recharts. */
export function ChartTooltip({ active, label, rows }: { active?: boolean; label?: React.ReactNode; rows: { name: string; value: string; color?: string }[] }) {
  if (!active || rows.length === 0) return null;
  return (
    <div className="rounded-brand border border-border bg-white px-3 py-2 text-xs shadow-lg">
      {label ? <p className="mb-1 font-heading font-semibold text-ink">{label}</p> : null}
      <ul className="space-y-0.5">
        {rows.map((r) => (
          <li key={r.name} className="flex items-center gap-2 text-grey-800">
            {r.color ? <span className="size-2.5 rounded-sm" style={{ background: r.color }} aria-hidden /> : null}
            <span className="flex-1">{r.name}</span>
            <span className="font-heading font-semibold text-ink tabular">{r.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function ChartFrame({
  title,
  description,
  children,
  aside,
  className,
  legend,
}: {
  title: string;
  description?: React.ReactNode;
  children: React.ReactNode;
  aside?: React.ReactNode;
  className?: string;
  legend?: { label: string; color: string; dashed?: boolean }[];
}) {
  return (
    <figure className={cn("card", className)}>
      <figcaption className="flex flex-col gap-2 border-b border-border px-5 py-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="font-heading text-[15px] font-semibold text-ink">{title}</p>
          {description ? <p className="mt-0.5 text-xs text-grey-700">{description}</p> : null}
        </div>
        {legend && legend.length > 1 ? (
          <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-grey-800" aria-label="Legend">
            {legend.map((l) => (
              <li key={l.label} className="flex items-center gap-1.5">
                <span className="inline-block h-0.5 w-4 rounded" style={{ background: l.color, borderTop: l.dashed ? `2px dashed ${l.color}` : undefined, height: l.dashed ? 0 : undefined }} aria-hidden />
                {l.label}
              </li>
            ))}
          </ul>
        ) : null}
        {aside}
      </figcaption>
      <div className="px-2 py-4 sm:px-4">{children}</div>
    </figure>
  );
}

export const axisProps = {
  tick: { fill: CHART.text, fontSize: 12, fontFamily: "Arial, sans-serif" },
  axisLine: { stroke: CHART.axis },
  tickLine: false as const,
};

export const gridProps = { stroke: CHART.grid, vertical: false as const };
