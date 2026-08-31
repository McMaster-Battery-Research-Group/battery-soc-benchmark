"use client";

import * as React from "react";
import Link from "next/link";
import { CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { Alert } from "@/components/ui/misc";
import { Term } from "@/components/term";
import { fmtPct } from "@/lib/utils";
import { COMPLEXITY_LABELS, EVALUATION_SCOPE } from "@/lib/test-cases";
import type { DryRunOutput } from "@/evaluator/types";
import { SocTrace } from "@/components/charts/soc-trace";
import { LogView } from "@/components/log-view";

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
    const lines = (poll?.log ?? "").split("\n").filter(Boolean);
    const last = lines[lines.length - 1]?.replace(/^\S+ /, "") ?? "";
    return (
      <div className="mt-4 rounded-brand bg-grey-100 px-4 py-3 text-sm text-grey-800" aria-live="polite">
        <div className="flex items-center gap-3">
          <Loader2 className="size-4 animate-spin text-bayfront" />
          <span>{poll?.status === "RUNNING" ? "Running validation and one open cycle…" : "Queued — starts as soon as an evaluator is free."}</span>
          {last ? <span className="ml-auto hidden max-w-[50%] truncate font-mono text-xs text-grey-600 sm:inline" title={last}>{last}</span> : null}
        </div>
        {poll?.log ? <LogView title={`Console (${lines.length} lines)`} log={poll.log} defaultOpen maxHeight="max-h-64" className="mt-3" /> : null}
      </div>
    );
  }
  if (poll?.status === "FAILED") {
    return (
      <div className="mt-4 space-y-3">
        <Alert variant="danger" title="The package did not run">
          <p className="break-words">{poll.failureMessage}</p>
          {poll.log ? <LogView title="Console" log={poll.log} defaultOpen maxHeight="max-h-72" className="mt-3" /> : null}
        </Alert>
        <p className="flex items-center gap-2 text-sm text-grey-700"><XCircle className="size-4 text-danger" /> Fix the package and run the test again — or <Link href="/contact?category=bug&subject=Dry%20run%20failed" className="text-maroon underline">report a problem</Link> if you think the evaluator is at fault.</p>
      </div>
    );
  }
  if (!r) return null;
  return (
    <div className="mt-4 space-y-4">
      <Alert variant="success" title="It runs">
        Passed the +0.3 A validation and completed the open cycle on the <strong>{r.runtime}</strong> runtime in {r.elapsedSec} s. This is not a score — the blinded evaluation runs {EVALUATION_SCOPE} — but a package that passes here will run there.
      </Alert>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {([
          [<Term key="rmse" k="rmse">RMSE (open cycle)</Term>, `${fmtPct(r.rmse)} %`],
          [<Term key="mae" k="mae">MAE</Term>, `${fmtPct(r.mae)} %`],
          [<Term key="maxe" k="maxe">Max error</Term>, `${fmtPct(r.maxErr, 1)} %`],
          // A MATLAB test run times one short cycle including the MATLAB session start-up, so its complexity is meaningless;
          // the full evaluation amortises start-up over 195 input matrices and reports the real bin.
          [<Term key="complexity" k="complexity">Complexity</Term>, r.runtime === "matlab" ? "measured in the full evaluation" : `${r.complexity} · ${COMPLEXITY_LABELS[r.complexity]}`],
        ] as [React.ReactNode, React.ReactNode][]).map(([k, v], ki) => (
          <div key={ki} className="rounded-brand border border-border px-3 py-2">
            <p className="text-xs text-grey-600">{k}</p>
            <p className="font-heading font-semibold text-ink">{v}</p>
          </div>
        ))}
      </div>
      {poll?.log ? <LogView title={`Console output (${poll.log.split("\n").filter(Boolean).length} lines)`} log={poll.log} className="mt-0" /> : null}
      <SocTrace traces={[{ key: "dry", label: `m80 ${r.cycle.cycle} at ${r.cycle.temperatureC} °C (open data)`, cell: "m80", cycle: r.cycle.cycle, temperatureC: r.cycle.temperatureC, t: r.trace.t, actual: r.trace.actual, estimated: r.trace.estimated }]} names={[modelName]} />
      {footer ? <p className="flex items-center gap-2 text-sm text-grey-700"><CheckCircle2 className="size-4 text-forest" /> {footer}</p> : null}
    </div>
  );
}
