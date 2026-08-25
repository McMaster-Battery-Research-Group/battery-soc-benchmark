"use client";

import * as React from "react";
import { FlaskConical, UploadCloud } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/misc";
import { fmtBytes, cn } from "@/lib/utils";
import { startDryRunAction } from "./dry-run-actions";
import { DryRunResult, useDryRunPoll } from "@/components/dry-run-result";
import { DryRunQuotaLine } from "@/components/dry-run-quota";

/**
 * "Test my package" — runs validation + one OPEN-data cycle through the real
 * evaluator before the user commits to a scored submission.
 */
export function DryRunPanel({ directUpload }: { directUpload: boolean }) {
  const [file, setFile] = React.useState<File | null>(null);
  const [id, setId] = React.useState<string | null>(null);
  const [err, setErr] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [pct, setPct] = React.useState<number | null>(null);
  const [attempts, setAttempts] = React.useState(0);
  const poll = useDryRunPoll(id);

  const start = async () => {
    if (!file) return;
    setErr(null);
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
      setAttempts((a) => a + 1);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(false);
      setPct(null);
    }
  };

  const running = !!id && (!poll || poll.status === "QUEUED" || poll.status === "RUNNING");
  return (
    <section className="card">
      <div className="flex items-start gap-3 border-b border-border px-5 py-4">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-brand bg-maroon-100 text-maroon"><FlaskConical className="size-5" /></span>
        <div>
          <h2 className="font-heading text-lg font-semibold text-ink">Test your package first</h2>
          <p className="text-sm text-grey-700">Runs your model through the real evaluator on one <strong>public</strong> drive cycle (m80, REORDERED1, 25 °C, 2 h). Catches format and runtime errors and shows your error and complexity — without using a submission, touching the blinded data, or appearing anywhere. Up to 5 per hour.</p>
          <DryRunQuotaLine refreshKey={attempts} className="mt-1" />
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
        <DryRunResult id={id} poll={poll} footer={<>Happy with it? Submit the same .zip below for the blinded evaluation.</>} />
      </div>
    </section>
  );
}
