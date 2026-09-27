"use client";

import * as React from "react";
import { progressFromLog } from "@/lib/progress";

/** "2 h 05 m" / "8 m" / "45 s" */
function short(sec: number) {
  if (sec >= 3600) return `${Math.floor(sec / 3600)} h ${String(Math.round((sec % 3600) / 60)).padStart(2, "0")} m`;
  if (sec >= 60) return `${Math.round(sec / 60)} m`;
  return `${Math.round(sec)} s`;
}

/**
 * Percentage, stage and remaining time for a running evaluation, read from its job log.
 * Client-side so the elapsed figure keeps counting between page refreshes; the log itself only
 * changes when the page is re-fetched.
 */
export function RunningProgress({ log }: { log: string }) {
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 5_000);
    return () => clearInterval(t);
  }, []);

  const { pct, etaSec, stage } = progressFromLog(log, now);
  if (pct === null) return <p className="mt-1 text-[11px] text-grey-600">starting…</p>;

  return (
    <div className="mt-1.5 w-[104px]">
      <div className="flex items-baseline justify-between gap-1">
        <span className="font-heading text-[11px] font-semibold tabular text-ink">{pct.toFixed(0)} %</span>
        {etaSec ? <span className="text-[10px] text-grey-600">~{short(etaSec)} left</span> : null}
      </div>
      <div className="mt-0.5 h-1.5 overflow-hidden rounded-full bg-grey-200">
        <div className="h-full rounded-full bg-maroon transition-[width] duration-500" style={{ width: `${Math.max(2, pct)}%` }} />
      </div>
      {stage ? (
        <p className="mt-0.5 truncate text-[10px] text-grey-600" title={stage}>
          {stage}
        </p>
      ) : null}
    </div>
  );
}
