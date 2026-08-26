"use client";

import * as React from "react";
import Link from "next/link";
import { CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { Alert } from "@/components/ui/misc";
import { fmtPct } from "@/lib/utils";
import { COMPLEXITY_LABELS } from "@/lib/test-cases";
import type { DryRunOutput } from "@/evaluator/types";
import { SocTrace } from "@/components/charts/soc-trace";

export type DryRunPoll = { status: string; result: DryRunOutput | null; failureMessage: string | null; log: string };

/** Polls /api/dry-runs/[id] until done. */
export function useDryRunPoll(id: string | null) {
  const [poll, setPoll] = React.useState<DryRunPoll | null>(null);
  React.useEffect(() => {
    setPoll(null);
    if (!id) return;
    let stop = false;
    const tick = async () => {
      try {
        const r = await fetch(`/api/dry-runs/${id}`, { cache: "no-store" });
        if (r.ok) {
          const j = (await r.json()) as DryRunPoll;
          if (!stop) setPoll(j);
          if (j.status === "COMPLETED" || j.status === "FAILED") return;
        }
      } catch {}
      if (!stop) setTimeout(tick, 2000);
    };
    tick();
    return () => {
      stop = true;
    };
  }, [id]);
  return poll;
}

/** Renders queued / running / failed / completed states of a dry run. */
export function DryRunResult({ id, poll, modelName = "Your model", footer }: { id: string | null; poll: DryRunPoll | null; modelName?: string; footer?: React.ReactNode }) {
  if (!id) return null;
  const running = !poll || poll.status === "QUEUED" || poll.status === "RUNNING";
  const r = poll?.result;
  if (running) {
    return (
      <div className="mt-4 flex items-center gap-3 rounded-brand bg-grey-100 px-4 py-3 text-sm text-grey-800" aria-live="polite">
        <Loader2 className="size-4 animate-spin text-bayfront" /> {poll?.status === "RUNNING" ? "Running validation and one open cycle…" : "Queued — starts as soon as an evaluator is free."}
      </div>
    );
  }
  if (poll?.status === "FAILED") {
    return (
      <div className="mt-4 space-y-3">
        <Alert variant="danger" title="The package did not run">
          <p className="break-words">{poll.failureMessage}</p>
          {poll.log ? <pre className="mt-3 max-h-72 max-w-full overflow-auto whitespace-pre-wrap break-all rounded-brand bg-grey-900 p-3 text-xs leading-relaxed text-white">{poll.log}</pre> : null}
        </Alert>
        <p className="flex items-center gap-2 text-sm text-grey-700"><XCircle className="size-4 text-danger" /> Fix the package and run the test again — or <Link href="/contact?category=bug&subject=Dry%20run%20failed" className="text-maroon underline">report a problem</Link> if you think the evaluator is at fault.</p>
      </div>
    );
  }
  if (!r) return null;
  return (
    <div className="mt-4 space-y-4">
      <Alert variant="success" title="It runs">
        Passed the +0.3 A validation and completed the open cycle on the <strong>{r.runtime}</strong> runtime in {r.elapsedSec} s. This is not a score — the blinded evaluation uses 144 cycles at six temperatures — but a package that passes here will run there.
      </Alert>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ["RMSE (open cycle)", `${fmtPct(r.rmse)} %`],
          ["MAE", `${fmtPct(r.mae)} %`],
          ["Max error", `${fmtPct(r.maxErr, 1)} %`],
          ["Complexity", `${r.complexity} · ${COMPLEXITY_LABELS[r.complexity]}`],
        ].map(([k, v]) => (
          <div key={k} className="rounded-brand border border-border px-3 py-2">
            <p className="text-xs text-grey-600">{k}</p>
            <p className="font-heading font-semibold text-ink">{v}</p>
          </div>
        ))}
      </div>
      <SocTrace traces={[{ key: "dry", label: `m80 ${r.cycle.cycle} at ${r.cycle.temperatureC} °C (open data)`, cell: "m80", cycle: r.cycle.cycle, temperatureC: r.cycle.temperatureC, t: r.trace.t, actual: r.trace.actual, estimated: r.trace.estimated }]} names={[modelName]} />
      {footer ? <p className="flex items-center gap-2 text-sm text-grey-700"><CheckCircle2 className="size-4 text-forest" /> {footer}</p> : null}
    </div>
  );
}
