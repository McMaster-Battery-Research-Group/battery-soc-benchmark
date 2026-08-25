"use client";

import * as React from "react";
import { FlaskConical, CheckCircle2, XCircle, Loader2, UploadCloud } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/misc";
import { fmtPct, fmtBytes, cn } from "@/lib/utils";
import { COMPLEXITY_LABELS } from "@/lib/test-cases";
import { startDryRunAction } from "./dry-run-actions";
import type { DryRunOutput } from "@/evaluator/types";
import { SocTrace } from "@/components/charts/soc-trace";

type Poll = { status: string; result: DryRunOutput | null; failureMessage: string | null; log: string };

/**
 * "Test my package" — runs validation + one OPEN-data cycle through the real
 * evaluator before the user commits to a scored submission.
 */
export function DryRunPanel({ directUpload }: { directUpload: boolean }) {
  const [file, setFile] = React.useState<File | null>(null);
  const [id, setId] = React.useState<string | null>(null);
  const [poll, setPoll] = React.useState<Poll | null>(null);
  const [err, setErr] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [pct, setPct] = React.useState<number | null>(null);

  React.useEffect(() => {
    if (!id) return;
    let stop = false;
    const tick = async () => {
      try {
        const r = await fetch(`/api/dry-runs/${id}`, { cache: "no-store" });
        if (r.ok) {
          const j = (await r.json()) as Poll;
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

  const start = async () => {
    if (!file) return;
    setErr(null);
    setPoll(null);
    setId(null);
    setBusy(true);
    try {
      const fd = new FormData();
      if (directUpload) {
        setPct(0);
        const { upload } = await import("@vercel/blob/client");
        const blob = await upload(`dry-runs/${file.name}`, file, { access: "public", handleUploadUrl: "/api/upload", onUploadProgress: (p) => setPct(Math.round(p.percentage)) });
        fd.set("fileUrl", blob.url);
        fd.set("fileName", file.name);
        setPct(null);
      } else {
        fd.set("file", file);
      }
      const res = await startDryRunAction(fd);
      if (!res.ok) setErr(res.error);
      else setId(res.id);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(false);
      setPct(null);
    }
  };

  const running = !!id && (!poll || poll.status === "QUEUED" || poll.status === "RUNNING");
  const r = poll?.result;

  return (
    <section className="card">
      <div className="flex items-start gap-3 border-b border-border px-5 py-4">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-brand bg-maroon-100 text-maroon"><FlaskConical className="size-5" /></span>
        <div>
          <h2 className="font-heading text-lg font-semibold text-ink">Test your package first</h2>
          <p className="text-sm text-grey-700">Runs your model through the real evaluator on one <strong>public</strong> drive cycle (m80, REORDERED1, 25 °C, 2 h). Catches format and runtime errors and shows your error and complexity — without using a submission, touching the blinded data, or appearing anywhere. Up to 5 per hour.</p>
        </div>
      </div>
      <div className="p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <label className={cn("flex flex-1 cursor-pointer items-center gap-3 rounded-brand border border-dashed border-border px-4 py-3 text-sm hover:border-maroon", file && "border-maroon")}>
            <UploadCloud className="size-5 text-grey-500" />
            <span className="truncate text-grey-800">{file ? `${file.name} · ${fmtBytes(file.size)}` : "Choose a .zip package…"}</span>
            <input type="file" accept=".zip,application/zip" className="sr-only" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          </label>
          <Button variant="secondary" onClick={start} disabled={!file || busy || running} loading={busy}>Run test</Button>
        </div>
        {pct !== null ? <p className="mt-2 text-xs text-grey-600">Uploading… {pct}%</p> : null}
        {err ? <Alert variant="danger" className="mt-4">{err}</Alert> : null}

        {running ? (
          <div className="mt-4 flex items-center gap-3 rounded-brand bg-grey-100 px-4 py-3 text-sm text-grey-800" aria-live="polite">
            <Loader2 className="size-4 animate-spin text-bayfront" /> {poll?.status === "RUNNING" ? "Running validation and one open cycle…" : "Queued — starts as soon as an evaluator is free."}
          </div>
        ) : null}

        {poll?.status === "FAILED" ? (
          <Alert variant="danger" className="mt-4" title="Your package did not run">
            <p>{poll.failureMessage}</p>
            {poll.log ? <pre className="mt-3 max-h-48 overflow-auto rounded-brand bg-grey-900 p-3 text-xs text-white">{poll.log}</pre> : null}
          </Alert>
        ) : null}

        {poll?.status === "COMPLETED" && r ? (
          <div className="mt-4 space-y-4">
            <Alert variant="success" title="Your package runs">
              It passed the +0.3 A validation and completed the open cycle on the <strong>{r.runtime}</strong> runtime in {r.elapsedSec} s. This is not a score — the blinded evaluation uses 144 cycles at six temperatures — but a package that passes here will run there.
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
            <SocTrace traces={[{ key: "dry", label: `m80 ${r.cycle.cycle} at ${r.cycle.temperatureC} °C (open data)`, cell: "m80", cycle: r.cycle.cycle, temperatureC: r.cycle.temperatureC, t: r.trace.t, actual: r.trace.actual, estimated: r.trace.estimated }]} names={["Your model"]} />
            <p className="flex items-center gap-2 text-sm text-grey-700"><CheckCircle2 className="size-4 text-forest" /> Happy with it? Submit the same .zip below for the blinded evaluation.</p>
          </div>
        ) : null}
        {poll?.status === "FAILED" ? <p className="mt-3 flex items-center gap-2 text-sm text-grey-700"><XCircle className="size-4 text-danger" /> Fix the package and run the test again.</p> : null}
      </div>
    </section>
  );
}
