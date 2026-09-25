"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { sendGAEvent } from "@next/third-parties/google";
import { Pencil, UploadCloud, FileArchive, X, RefreshCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogTrigger, DialogClose } from "@/components/ui/dialog";
import { Input, Textarea, Label, NativeSelect, FieldError, Hint } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { MODEL_TYPES } from "@/lib/validation";
import { MODEL_TYPE_LABELS } from "@/lib/test-cases";
import { cn, fmtBytes } from "@/lib/utils";
import { uploadPackage } from "@/lib/upload-client";
import { updateSubmissionDetailsAction, resubmitAction } from "../../submit/actions";

/** Owner/admin: edit the descriptive fields. Score-relevant data never changes here. */
export function EditDetailsDialog({ id, modelName, description, modelType, locked }: { id: string; modelName: string; description: string; modelType: string; locked: boolean }) {
  const router = useRouter();
  const { push } = useToast();
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState(modelName);
  const [desc, setDesc] = React.useState(description);
  const [type, setType] = React.useState(modelType);
  const [errors, setErrors] = React.useState<Record<string, string | undefined>>({});
  const [pending, start] = React.useTransition();

  const save = () =>
    start(async () => {
      const res = await updateSubmissionDetailsAction(id, { modelName: name, description: desc, modelType: type });
      if (!res.ok) return setErrors(res.errors);
      setErrors({});
      setOpen(false);
      push({ kind: "success", title: "Details updated" });
      router.refresh();
    });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button variant="outline" size="sm"><Pencil /> Edit details</Button></DialogTrigger>
      <DialogContent title="Edit submission details" description={locked ? "This is a contest entry of a closed contest: the name and model type are frozen; only the description can change." : "Name, description and model type only — scores are never affected. Edits are noted in the score history."} size="md">
        <div className="space-y-4">
          <div>
            <Label htmlFor="ed-name" required>Model name</Label>
            <Input id="ed-name" value={name} maxLength={50} onChange={(e) => setName(e.target.value)} disabled={locked} aria-invalid={!!errors.modelName} />
            <Hint>{name.length}/50</Hint>
            <FieldError>{errors.modelName}</FieldError>
          </div>
          <div>
            <Label htmlFor="ed-desc" required>Description</Label>
            <Textarea id="ed-desc" rows={5} value={desc} maxLength={1000} onChange={(e) => setDesc(e.target.value)} aria-invalid={!!errors.description} />
            <Hint>{desc.length}/1000</Hint>
            <FieldError>{errors.description}</FieldError>
          </div>
          <div>
            <Label htmlFor="ed-type" required>Model type</Label>
            <NativeSelect id="ed-type" value={type} onChange={(e) => setType(e.target.value)} disabled={locked}>
              {MODEL_TYPES.map((t) => <option key={t} value={t}>{MODEL_TYPE_LABELS[t]}</option>)}
            </NativeSelect>
            <FieldError>{errors.modelType}</FieldError>
          </div>
          {errors.form ? <FieldError>{errors.form}</FieldError> : null}
        </div>
        <DialogFooter>
          <DialogClose asChild><Button variant="outline">Cancel</Button></DialogClose>
          <Button onClick={save} loading={pending}>Save changes</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Owner/admin: upload a new package for the SAME submission. Scores of the
 * previous version stay in the score history; the leaderboard shows the latest.
 */
export function NewVersionDialog({ id, version, directUpload, maxMb, disabledReason }: { id: string; version: number; directUpload: boolean; maxMb: number; disabledReason?: string }) {
  const router = useRouter();
  const { push } = useToast();
  const [open, setOpen] = React.useState(false);
  const [file, setFile] = React.useState<File | null>(null);
  const [drag, setDrag] = React.useState(false);
  const [pct, setPct] = React.useState<number | null>(null);
  const [err, setErr] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  const pick = (f: File | null) => {
    setErr(null);
    if (!f) return setFile(null);
    if (!f.name.toLowerCase().endsWith(".zip")) return setErr("Only .zip packages are accepted.");
    if (f.size > maxMb * 1024 * 1024) return setErr(`File exceeds the ${maxMb} MB limit.`);
    setFile(f);
  };

  const submit = async () => {
    if (!file) return;
    setBusy(true);
    setErr(null);
    try {
      const fd = new FormData();
      if (directUpload) {
        setPct(0);
        const key = await uploadPackage(file, "submission", setPct);
        fd.set("fileKey", key);
        fd.set("fileName", file.name);
        setPct(null);
      } else {
        fd.set("file", file);
      }
      const res = await resubmitAction(id, fd);
      if (!res.ok) return setErr(res.error);
      setOpen(false);
      push({ kind: "success", title: `Version ${res.version} queued for evaluation` });
      router.push(`/submissions/${id}?new=1`);
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(false);
      setPct(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) { setFile(null); setErr(null); } }}>
      <DialogTrigger asChild>
        <Button variant="secondary" size="sm" disabled={!!disabledReason} title={disabledReason}><RefreshCcw /> Submit new version</Button>
      </DialogTrigger>
      <DialogContent title={`Submit version ${version + 1}`} description="Upload an updated package for this same submission. It is evaluated on the full blinded set like a new submission (counts toward your daily limit). The current score stays in the score history and the leaderboard switches to the new result when it completes." size="md">
        <div
          onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => { e.preventDefault(); setDrag(false); pick(e.dataTransfer.files[0] ?? null); }}
          className={cn("relative flex flex-col items-center justify-center rounded-brand border-2 border-dashed px-6 py-8 text-center transition-colors", drag ? "border-maroon bg-maroon-100" : "border-border bg-grey-100/50", err && "border-maroon")}
        >
          <input id="nv-file" type="file" accept=".zip,application/zip" className="sr-only" onChange={(e) => pick(e.target.files?.[0] ?? null)} />
          {file ? (
            <div className="flex items-center gap-3">
              <FileArchive className="size-8 text-maroon" />
              <div className="text-left"><p className="font-heading font-semibold text-ink">{file.name}</p><p className="text-xs text-grey-600">{fmtBytes(file.size)}</p></div>
              <button type="button" onClick={() => { sendGAEvent("event", "button_click", { button_name: "remove_new_version_file" }); pick(null); }} className="ml-2 rounded-brand p-1 text-grey-600 hover:bg-grey-200 hover:text-ink" aria-label="Remove file"><X className="size-4" /></button>
            </div>
          ) : (
            <>
              <UploadCloud className="size-9 text-grey-500" />
              <p className="mt-2 font-heading font-semibold text-ink">Drag & drop the new .zip here</p>
              <p className="mt-1 text-sm text-grey-700">or <label htmlFor="nv-file" className="cursor-pointer font-medium text-maroon underline">browse files</label> · up to {maxMb} MB</p>
            </>
          )}
        </div>
        {pct !== null ? <p className="mt-2 text-xs text-grey-600">Uploading… {pct}%</p> : null}
        <FieldError>{err}</FieldError>
        <p className="mt-2 text-xs text-grey-600">Tip: run it through <strong>Test your package first</strong> on the Submit page before uploading a new version.</p>
        <DialogFooter>
          <DialogClose asChild><Button variant="outline">Cancel</Button></DialogClose>
          <Button onClick={submit} loading={busy} disabled={!file || busy}><RefreshCcw /> Evaluate version {version + 1}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
