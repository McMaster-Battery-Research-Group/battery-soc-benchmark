"use client";

import * as React from "react";
import { useActionState } from "react";
import { UploadCloud, FileArchive, X, Trophy } from "lucide-react";
import { createSubmissionAction, type SubmitState } from "./actions";
import { Field, SubmitButton } from "@/components/forms/field";
import { Label, NativeSelect, FieldError, Hint } from "@/components/ui/input";
import { Checkbox, Switch } from "@/components/ui/checkbox";
import { Alert } from "@/components/ui/misc";
import { MODEL_TYPES } from "@/lib/validation";
import { MODEL_TYPE_LABELS } from "@/lib/test-cases";
import { cn, fmtBytes } from "@/lib/utils";

export function SubmitForm({ contests, preselectContest, maxMb, directUpload }: { contests: { id: string; title: string; remaining: number }[]; preselectContest?: string; maxMb: number; directUpload: boolean }) {
  const [state, rawAction] = useActionState<SubmitState, FormData>(createSubmissionAction, {});
  const [uploadPct, setUploadPct] = React.useState<number | null>(null);
  const [uploadErr, setUploadErr] = React.useState<string | undefined>();
  // In blob mode the browser uploads the package first, then posts only metadata + URL.
  const action = async (fd: FormData) => {
    if (directUpload) {
      const f = fd.get("file");
      if (f instanceof File && f.size > 0) {
        try {
          setUploadErr(undefined);
          setUploadPct(0);
          const { upload } = await import("@vercel/blob/client");
          const blob = await upload(`submissions/${f.name}`, f, {
            access: "public",
            handleUploadUrl: "/api/upload",
            onUploadProgress: (p) => setUploadPct(Math.round(p.percentage)),
          });
          fd.set("fileUrl", blob.url);
          fd.set("fileName", f.name);
        } catch (e) {
          setUploadPct(null);
          setUploadErr(e instanceof Error ? e.message : "Upload failed");
          return;
        }
        fd.delete("file");
      }
    }
    setUploadPct(null);
    rawAction(fd);
  };
  const [file, setFile] = React.useState<File | null>(null);
  const [drag, setDrag] = React.useState(false);
  const [isPrivate, setIsPrivate] = React.useState(false);
  const [contestId, setContestId] = React.useState(preselectContest ?? state.values?.contestId ?? "");
  const [nameLen, setNameLen] = React.useState(state.values?.modelName?.length ?? 0);
  const [descLen, setDescLen] = React.useState(state.values?.description?.length ?? 0);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [localErr, setLocalErr] = React.useState<string | undefined>();

  const pick = (f: File | null) => {
    setLocalErr(undefined);
    if (!f) return setFile(null);
    if (!f.name.toLowerCase().endsWith(".zip")) return setLocalErr("Only .zip submission packages are accepted.");
    if (f.size > maxMb * 1024 * 1024) return setLocalErr(`File exceeds the ${maxMb} MB limit.`);
    setFile(f);
    if (inputRef.current) {
      const dt = new DataTransfer();
      dt.items.add(f);
      inputRef.current.files = dt.files;
    }
  };

  return (
    <form action={action} className="card p-6 md:p-8" noValidate>
      <fieldset className="space-y-5">
        <legend className="mb-1 font-heading text-lg font-semibold text-ink">1. Describe the model</legend>
        <div>
          <Field label="Model name" name="modelName" required maxLength={50} placeholder="e.g. LSTM-64 with OCV warm-start" defaultValue={state.values?.modelName} error={state.errors?.modelName} onChange={(e) => setNameLen(e.currentTarget.value.length)} hint={<span className="tabular">{nameLen}/50 — shown on the leaderboard; name it after the method.</span>} />
        </div>
        <Field label="Description" name="description" textarea required maxLength={1000} rows={5} placeholder="Architecture, inputs, training data used, key design choices…" defaultValue={state.values?.description} error={state.errors?.description} onChange={(e) => setDescLen(e.currentTarget.value.length)} hint={<span className="tabular">{descLen}/1000</span>} />
        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <Label htmlFor="modelType" required>Model type</Label>
            <NativeSelect id="modelType" name="modelType" defaultValue={state.values?.modelType ?? ""} required aria-invalid={!!state.errors?.modelType}>
              <option value="" disabled>Select a type…</option>
              {MODEL_TYPES.map((t) => <option key={t} value={t}>{MODEL_TYPE_LABELS[t]}</option>)}
            </NativeSelect>
            <FieldError>{state.errors?.modelType}</FieldError>
          </div>
          <div>
            <Label htmlFor="evaluationLevel">Evaluation level</Label>
            <NativeSelect id="evaluationLevel" name="evaluationLevel" defaultValue={state.values?.evaluationLevel ?? "DYNAMIC"}>
              <option value="DYNAMIC">Dynamic (full drive cycles)</option>
              <option value="STATIC">Static (characterization only)</option>
            </NativeSelect>
            <Hint>Dynamic is the standard leaderboard evaluation.</Hint>
          </div>
        </div>
      </fieldset>

      <fieldset className="mt-8 space-y-4">
        <legend className="mb-1 font-heading text-lg font-semibold text-ink">2. Upload the package</legend>
        <div
          onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => { e.preventDefault(); setDrag(false); pick(e.dataTransfer.files[0] ?? null); }}
          className={cn("relative flex flex-col items-center justify-center rounded-brand border-2 border-dashed px-6 py-10 text-center transition-colors", drag ? "border-maroon bg-maroon-100" : "border-border bg-grey-100/50", (state.errors?.file || localErr) && "border-maroon")}
        >
          <input ref={inputRef} id="file" name="file" type="file" accept=".zip,application/zip" className="sr-only" onChange={(e) => pick(e.target.files?.[0] ?? null)} />
          {file ? (
            <div className="flex items-center gap-3">
              <FileArchive className="size-8 text-maroon" />
              <div className="text-left">
                <p className="font-heading font-semibold text-ink">{file.name}</p>
                <p className="text-xs text-grey-600">{fmtBytes(file.size)}</p>
              </div>
              <button type="button" onClick={() => { pick(null); if (inputRef.current) inputRef.current.value = ""; }} className="ml-2 rounded-brand p-1 text-grey-600 hover:bg-grey-200 hover:text-ink" aria-label="Remove file"><X className="size-4" /></button>
            </div>
          ) : (
            <>
              <UploadCloud className="size-10 text-grey-500" />
              <p className="mt-3 font-heading font-semibold text-ink">Drag & drop your .zip here</p>
              <p className="mt-1 text-sm text-grey-700">or <label htmlFor="file" className="cursor-pointer font-medium text-maroon underline">browse files</label> · up to {maxMb} MB</p>
            </>
          )}
        </div>
        {uploadPct !== null ? (
          <div aria-live="polite">
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-grey-200"><div className="h-full rounded-full bg-maroon transition-[width]" style={{ width: `${uploadPct}%` }} /></div>
            <p className="mt-1 text-xs text-grey-600">Uploading package… {uploadPct}%</p>
          </div>
        ) : null}
        <FieldError>{localErr ?? uploadErr ?? state.errors?.file}</FieldError>
      </fieldset>

      <fieldset className="mt-8 space-y-4">
        <legend className="mb-1 font-heading text-lg font-semibold text-ink">3. Visibility & contest</legend>
        <label className="flex items-start gap-3">
          <Switch name="isPrivate" checked={isPrivate} onCheckedChange={setIsPrivate} disabled={!!contestId} />
          <span className="text-sm">
            <span className="font-heading font-medium text-ink">Private submission</span>
            <span className="block text-grey-700">Results are visible only to you and excluded from the public leaderboard. You can change this later.{contestId ? " Contest entries must be public." : ""}</span>
          </span>
        </label>
        {contests.length ? (
          <div>
            <Label htmlFor="contestId"><span className="inline-flex items-center gap-1.5"><Trophy className="size-4 text-maroon" /> Enter into a contest</span></Label>
            <NativeSelect id="contestId" name="contestId" value={contestId} onChange={(e) => { setContestId(e.target.value); if (e.target.value) setIsPrivate(false); }}>
              <option value="">Not a contest entry</option>
              {contests.map((c) => <option key={c.id} value={c.id} disabled={c.remaining <= 0}>{c.title} — {c.remaining} of your submissions remaining</option>)}
            </NativeSelect>
            <FieldError>{state.errors?.contestId}</FieldError>
          </div>
        ) : (
          <input type="hidden" name="contestId" value="" />
        )}
      </fieldset>

      <div className="mt-8 border-t border-border pt-6">
        <label className="flex items-start gap-3 text-sm">
          <Checkbox name="acceptTerms" required aria-invalid={!!state.errors?.acceptTerms} />
          <span className="text-grey-800">I confirm the model was developed using only the open portion of the dataset or other public data, and I accept the <a href="/terms" className="text-maroon underline" target="_blank">submission terms</a>. My name and affiliation will appear beside public results.</span>
        </label>
        <FieldError>{state.errors?.acceptTerms}</FieldError>
        {state.errors?.form ? <Alert variant="danger" className="mt-4">{state.errors.form}</Alert> : null}
        <div className="mt-6 flex items-center gap-3">
          <SubmitButton size="lg">Submit for evaluation</SubmitButton>
          <p className="text-xs text-grey-600">Structural checks run instantly; evaluation is queued.</p>
        </div>
      </div>
    </form>
  );
}
