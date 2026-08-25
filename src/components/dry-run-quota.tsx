"use client";

import * as React from "react";
import { Clock, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatWait, type DryRunQuota } from "@/lib/dry-run-quota";
import { getDryRunQuotaAction } from "@/app/actions/dry-run-quota";

/**
 * "3 of 5 test runs left this hour" line. Re-fetches whenever `refreshKey`
 * changes (bump it after starting a run or receiving a limit error) and ticks
 * the countdown locally while the quota is exhausted.
 */
export function DryRunQuotaLine({ refreshKey, className }: { refreshKey: unknown; className?: string }) {
  const [q, setQ] = React.useState<DryRunQuota | null>(null);
  const [fetchedAt, setFetchedAt] = React.useState(0);
  const [now, setNow] = React.useState(0);

  React.useEffect(() => {
    let alive = true;
    getDryRunQuotaAction().then((r) => {
      if (!alive) return;
      setQ(r);
      const t = Date.now();
      setFetchedAt(t);
      setNow(t);
    });
    return () => {
      alive = false;
    };
  }, [refreshKey]);

  // Tick while exhausted so the estimate stays honest; refetch once the slot should have freed.
  const exhausted = !!q && q.remaining === 0;
  React.useEffect(() => {
    if (!exhausted) return;
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, [exhausted]);
  const [tick, setTick] = React.useState(0);
  const resetIn = q ? Math.max(0, q.resetInMs - (now - fetchedAt)) : 0;
  React.useEffect(() => {
    if (exhausted && resetIn === 0) setTick((t) => t + 1);
  }, [exhausted, resetIn]);
  React.useEffect(() => {
    if (tick) getDryRunQuotaAction().then((r) => { setQ(r); const t = Date.now(); setFetchedAt(t); setNow(t); });
  }, [tick]);

  if (!q) return null;
  if (q.unlimited) {
    return (
      <p className={cn("inline-flex items-center gap-1.5 text-xs text-grey-600", className)}>
        <ShieldCheck className="size-3.5 text-maroon" /> Administrator — no test-run limit ({q.used} this hour).
      </p>
    );
  }
  return (
    <p className={cn("inline-flex items-center gap-1.5 text-xs", exhausted ? "text-maroon" : "text-grey-600", className)}>
      <Clock className="size-3.5" />
      {exhausted ? <>Limit reached — next test run frees up in {formatWait(resetIn)}.</> : <>{q.remaining} of {q.limit} test runs left this hour.</>}
    </p>
  );
}
