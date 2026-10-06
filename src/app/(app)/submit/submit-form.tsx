"use client";

import * as React from "react";
import { useActionState } from "react";
import { UploadCloud, FileArchive, X, Trophy, Camera, Users, FlaskConical, Package, Info, SlidersHorizontal, ChevronDown } from "lucide-react";
import { createSubmissionAction, type SubmitState } from "./actions";
import { startDryRunAction } from "./dry-run-actions";
import { DryRunResult, useDryRunPoll } from "@/components/dry-run-result";
import { DryRunQuotaLine } from "@/components/dry-run-quota";
import { Field, SubmitButton } from "@/components/forms/field";
import { Label, NativeSelect, FieldError, Input } from "@/components/ui/input";
import { Checkbox, Switch } from "@/components/ui/checkbox";
import { Alert } from "@/components/ui/misc";
import { MODEL_TYPES, submissionMetaSchema, zodErrors, type FieldErrors } from "@/lib/validation";
import { MODEL_TYPE_LABELS } from "@/lib/test-cases";
import { cn, fmtBytes } from "@/lib/utils";
import { uploadPackage } from "@/lib/upload-client";
import { Avatar } from "@/components/avatar";
import { resizeAvatar } from "@/lib/avatar-client";
import { UserPickerDialog } from "@/components/user-picker";
import type { UserHit } from "@/app/actions/users";
import { Button } from "@/components/ui/button";

/** Step header: number, icon, title, one line of context. */
function StepHeader({ n, icon: Icon, title, sub }: { n: number; icon: React.ComponentType<{ className?: string }>; title: string; sub: string }) {
  return (
    <div className="flex items-start gap-3">
      <span className="relative flex size-10 shrink-0 items-center justify-center rounded-brand bg-maroon text-white">
        <Icon className="size-5" />
        <span className="absolute -bottom-1.5 -right-1.5 flex size-5 items-center justify-center rounded-full bg-gold font-heading text-[11px] font-bold text-ink ring-2 ring-white">{n}</span>
      </span>
      <div>
        <h2 className="font-heading text-lg font-semibold leading-tight text-ink">{title}</h2>
        <p className="mt-0.5 text-sm text-grey-700">{sub}</p>
      </div>
    </div>
  );
}

export function SubmitForm({ contests, preselectContest, maxMb, directUpload }: { contests: { id: string; title: string; remaining: number }[]; preselectContest?: string; maxMb: number; directUpload: boolean }) {
  const [state, rawAction] = useActionState<SubmitState, FormData>(createSubmissionAction, {});
  const [uploadPct, setUploadPct] = React.useState<number | null>(null);
  const [uploadErr, setUploadErr] = React.useState<string | undefined>();
  const [clientErrors, setClientErrors] = React.useState<FieldErrors>({});
  const [checking, setChecking] = React.useState(false); // upload done, server validating the package
  React.useEffect(() => setChecking(false), [state]); // a server response (error) ends it; success redirects away

  // Controlled fields
  const [modelName, setModelName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [modelType, setModelType] = React.useState("");
  const [evaluationLevel] = React.useState("DYNAMIC"); // single evaluation mode today (tracker #9)
  const [isPrivate, setIsPrivate] = React.useState(false);
  const [contestId, setContestId] = React.useState(preselectContest ?? "");
  const [acceptTerms, setAcceptTerms] = React.useState(false);
  const [collabs, setCollabs] = React.useState<UserHit[]>([]);
  // submitting on someone else's behalf: they are the author, the uploader may stay off the credits
  const [behalf, setBehalf] = React.useState(false);
  const [behalfKind, setBehalfKind] = React.useState<"account" | "guest">("guest");
  const [behalfUser, setBehalfUser] = React.useState<UserHit | null>(null);
  const [behalfName, setBehalfName] = React.useState("");
  const [behalfAffil, setBehalfAffil] = React.useState("");
  const [behalfPhoto, setBehalfPhoto] = React.useState<string | null>(null);
  const [showMe, setShowMe] = React.useState(false);
  const [file, setFile] = React.useState<File | null>(null);
  const [drag, setDrag] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [localErr, setLocalErr] = React.useState<string | undefined>();

  // Test run (dry run) of the chosen package, inline in step 1
  const [testId, setTestId] = React.useState<string | null>(null);
  const [testErr, setTestErr] = React.useState<string | null>(null);
  const [testBusy, setTestBusy] = React.useState(false);
  const [testPct, setTestPct] = React.useState<number | null>(null);
  const [testAttempts, setTestAttempts] = React.useState(0);
  const poll = useDryRunPoll(testId);
  const testRunning = !!testId && (!poll || poll.status === "QUEUED" || poll.status === "RUNNING");

  const errors: FieldErrors = { ...state.errors, ...clientErrors };

  // Put the kept file back into the <input type=file> whenever the form gets reset by an action.
  const syncFileInput = React.useCallback(() => {
    if (!inputRef.current) return;
    const dt = new DataTransfer();
    if (file) dt.items.add(file);
    inputRef.current.files = dt.files;
  }, [file]);
  React.useEffect(syncFileInput, [syncFileInput, state]);

  // Scroll the first error into view after a failed submit.
  const formRef = React.useRef<HTMLFormElement>(null);
  React.useEffect(() => {
    if (!Object.keys(errors).length) return;
    formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"], [data-error="true"]')?.scrollIntoView({ behavior: "smooth", block: "center" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, clientErrors]);

  const pick = (f: File | null) => {
    setLocalErr(undefined);
    setTestId(null);
    setTestErr(null);
    if (!f) return setFile(null);
    if (!f.name.toLowerCase().endsWith(".zip")) return setLocalErr("Only .zip submission packages are accepted.");
    if (f.size > maxMb * 1024 * 1024) return setLocalErr(`File exceeds the ${maxMb} MB limit.`);
    setFile(f);
    setClientErrors((e) => ({ ...e, file: undefined }));
  };

  const runTest = async () => {
    if (!file) return;
    setTestErr(null);
    setTestId(null);
    setTestBusy(true);
    try {
      const fd = new FormData();
      if (directUpload) {
        setTestPct(0);
        const key = await uploadPackage(file, "dry-run", setTestPct);
        fd.set("fileKey", key);
        fd.set("fileName", file.name);
        setTestPct(null);
      } else {
        fd.set("file", file);
      }
      const res = await startDryRunAction(fd);
      if (!res.ok) setTestErr(res.error);
      else setTestId(res.id);
      setTestAttempts((a) => a + 1);
    } catch (e) {
      setTestErr(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setTestBusy(false);
      setTestPct(null);
    }
  };

  const action = async (fd: FormData) => {
    // 1) Client-side validation — same schema as the server, plus the file.
    const parsed = submissionMetaSchema.safeParse({ modelName, description, modelType, evaluationLevel, isPrivate, contestId: contestId || null, acceptTerms });
    const errs: FieldErrors = parsed.success ? {} : zodErrors(parsed.error);
    if (!file) errs.file = "Choose your submission package (.zip containing Model.m, Model.p or Model.py).";
    if (behalf && behalfKind === "account" && !behalfUser) errs.behalf = "Choose the author's account.";
    if (behalf && behalfKind === "guest" && behalfName.trim().length < 2) errs.behalf = "Enter the author's full name.";
    setClientErrors(errs);
    if (Object.keys(errs).length) return; // nothing sent, nothing reset

    // 2) Build the payload from state (not from the DOM, which may have been reset).
    fd.set("modelName", modelName);
    fd.set("description", description);
    fd.set("modelType", modelType);
    fd.set("evaluationLevel", evaluationLevel);
    fd.set("isPrivate", isPrivate ? "on" : "");
    fd.set("contestId", contestId);
    fd.set("acceptTerms", acceptTerms ? "on" : "");
    fd.set("collaboratorIds", JSON.stringify(collabs.map((c) => c.id)));
    fd.set("onBehalf", behalf ? "on" : "");
    fd.set("behalfKind", behalfKind);
    fd.set("behalfUserId", behalfUser?.id ?? "");
    fd.set("behalfName", behalfName);
    fd.set("behalfAffiliation", behalfAffil);
    fd.set("behalfPhoto", behalfPhoto ?? "");
    fd.set("showMe", showMe ? "on" : "");
    fd.set("file", file!);

    // 3) With cloud storage the browser uploads the package first, then posts only metadata + object key.
    if (directUpload) {
      try {
        setUploadErr(undefined);
        setUploadPct(0);
        const key = await uploadPackage(file!, "submission", setUploadPct);
        fd.set("fileKey", key);
        fd.set("fileName", file!.name);
      } catch (e) {
        setUploadPct(null);
        setUploadErr(e instanceof Error ? e.message : "Upload failed");
        return;
      }
      fd.delete("file");
    }
    setUploadPct(null);
    setChecking(true);
    rawAction(fd);
  };

  const clearErr = (k: string) => setClientErrors((e) => (e[k] ? { ...e, [k]: undefined } : e));
  const optionsOpen = behalf || collabs.length > 0 || isPrivate || !!errors.behalf;

  return (
    <form ref={formRef} action={action} className="card divide-y divide-border" noValidate>
      {/* 1. package */}
      <section className="space-y-4 p-6 md:p-8">
        <StepHeader n={1} icon={Package} title="Your package" sub={`One .zip with Model.m, Model.p or Model.py at the top level, plus any parameter files. Up to ${maxMb} MB.`} />
        <div
          data-error={!!(errors.file || localErr)}
          onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => { e.preventDefault(); setDrag(false); pick(e.dataTransfer.files[0] ?? null); }}
          className={cn("relative flex flex-col items-center justify-center rounded-brand border-2 border-dashed px-6 text-center transition-colors", file ? "py-5" : "py-10", drag ? "border-maroon bg-maroon-100" : "border-border bg-grey-100/50", (errors.file || localErr) && "border-maroon")}
        >
          <input ref={inputRef} id="file" name="file" type="file" accept=".zip,application/zip" className="sr-only" onChange={(e) => pick(e.target.files?.[0] ?? null)} />
          {file ? (
            <div className="flex w-full flex-wrap items-center justify-center gap-3">
              <FileArchive className="size-8 text-maroon" />
              <div className="text-left">
                <p className="font-heading font-semibold text-ink">{file.name}</p>
                <p className="text-xs text-grey-600">{fmtBytes(file.size)}</p>
              </div>
              <button type="button" onClick={() => { pick(null); if (inputRef.current) inputRef.current.value = ""; }} className="rounded-brand p-1 text-grey-600 hover:bg-grey-200 hover:text-ink" aria-label="Remove file"><X className="size-4" /></button>
              <div className="ml-auto flex flex-wrap items-center gap-2">
                <Button type="button" variant="secondary" size="sm" onClick={runTest} disabled={testBusy || testRunning} loading={testBusy}><FlaskConical /> {testId ? "Test again" : "Test it first"}</Button>
                <label htmlFor="file" className="cursor-pointer text-sm font-medium text-maroon underline">Choose another</label>
              </div>
            </div>
          ) : (
            <>
              <UploadCloud className="size-10 text-grey-500" />
              <p className="mt-3 font-heading font-semibold text-ink">Drop your .zip here</p>
              <p className="mt-1 text-sm text-grey-700">or <label htmlFor="file" className="cursor-pointer font-medium text-maroon underline">browse files</label></p>
            </>
          )}
        </div>
        <FieldError>{localErr ?? uploadErr ?? errors.file}</FieldError>
        {file ? (
          <div className="rounded-brand bg-grey-100/70 px-4 py-3 text-sm text-grey-700">
            <p><strong className="text-ink">Test it first</strong> runs your model on one public drive cycle through the real evaluator. It catches format and runtime errors, shows your error and complexity, and does not use a submission.</p>
            <DryRunQuotaLine refreshKey={testAttempts} className="mt-1" />
            {testPct !== null ? <p className="mt-2 text-xs text-grey-600">Uploading… {testPct}%</p> : null}
            {testErr ? <Alert variant="danger" className="mt-3">{testErr}</Alert> : null}
            <DryRunResult id={testId} poll={poll} footer={<>Happy with it? Fill in the details below and submit the same package.</>} />
          </div>
        ) : null}
        {uploadPct !== null || checking ? (
          <div aria-live="polite">
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-grey-200"><div className={`h-full rounded-full bg-maroon transition-[width] ${checking ? "animate-pulse" : ""}`} style={{ width: `${checking ? 100 : uploadPct}%` }} /></div>
            <p className="mt-1 text-xs text-grey-600">{checking ? "Upload complete. Checking the package and queuing the evaluation; you will be taken to the live status page." : `Uploading package… ${uploadPct}%`}</p>
          </div>
        ) : null}
      </section>

      {/* 2. about the model */}
      <section className="space-y-5 p-6 md:p-8">
        <StepHeader n={2} icon={Info} title="About the model" sub="What appears on the leaderboard and the results page." />
        <div className="grid gap-5 sm:grid-cols-[1fr_220px]">
          <Field label="Model name" name="modelName" required maxLength={50} placeholder="e.g. LSTM-64 with OCV warm-start" value={modelName} error={errors.modelName} onChange={(e) => { setModelName(e.currentTarget.value); clearErr("modelName"); }} hint={<span className="tabular">{modelName.length}/50. Name it after the method.</span>} />
          <div>
            <Label htmlFor="modelType" required>Model type</Label>
            <NativeSelect id="modelType" name="modelType" value={modelType} onChange={(e) => { setModelType(e.target.value); clearErr("modelType"); }} required aria-invalid={!!errors.modelType}>
              <option value="" disabled>Select a type…</option>
              {MODEL_TYPES.map((t) => <option key={t} value={t}>{MODEL_TYPE_LABELS[t]}</option>)}
            </NativeSelect>
            <FieldError>{errors.modelType}</FieldError>
          </div>
        </div>
        <Field label="Description" name="description" textarea required maxLength={1000} rows={4} placeholder="Architecture, inputs, training data used, key design choices…" value={description} error={errors.description} onChange={(e) => { setDescription(e.currentTarget.value); clearErr("description"); }} hint={<span className="tabular">{description.length}/1000</span>} />
        {/* "Evaluation level" (DYNAMIC | STATIC) is kept in the schema for the historical data but is not offered:
            every submission is evaluated the same way. Re-add a control here if a second evaluation mode is defined. */}
      </section>

      {/* 3. options: contest, visibility, authors */}
      <section className="space-y-5 p-6 md:p-8">
        <StepHeader n={3} icon={SlidersHorizontal} title="Options" sub="Most people leave these as they are." />
        {contests.length ? (
          <div className="max-w-md">
            <Label htmlFor="contestId"><span className="inline-flex items-center gap-1.5"><Trophy className="size-4 text-maroon" /> Enter into a contest</span></Label>
            <NativeSelect id="contestId" name="contestId" value={contestId} onChange={(e) => { setContestId(e.target.value); if (e.target.value) setIsPrivate(false); clearErr("contestId"); }} aria-invalid={!!errors.contestId}>
              <option value="">Not a contest entry</option>
              {contests.map((c) => <option key={c.id} value={c.id} disabled={c.remaining <= 0}>{c.title}: {c.remaining} of your submissions remaining</option>)}
            </NativeSelect>
            <FieldError>{errors.contestId}</FieldError>
          </div>
        ) : null}
        <label className="flex items-start gap-3">
          <Switch name="isPrivate" checked={isPrivate} onCheckedChange={setIsPrivate} disabled={!!contestId} />
          <span className="text-sm">
            <span className="font-heading font-medium text-ink">Keep the results private</span>
            <span className="block text-grey-700">Visible only to you and your co-authors, off the public leaderboard. You can change this later.{contestId ? " Contest entries must be public." : ""}</span>
          </span>
        </label>

        <details open={optionsOpen || undefined} className="group rounded-brand border border-border">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 [&::-webkit-details-marker]:hidden">
            <span className="flex items-center gap-2 font-heading text-sm font-semibold text-ink"><Users className="size-4 text-maroon" /> Co-authors, or submitting for someone else</span>
            <ChevronDown className="size-4 text-grey-500 transition-transform group-open:rotate-180" />
          </summary>
          <div className="space-y-4 border-t border-border p-4">
            <label className="flex items-start gap-3">
              <Switch checked={behalf} onCheckedChange={(v) => { setBehalf(v); clearErr("behalf"); }} />
              <span className="text-sm">
                <span className="font-heading font-medium text-ink">I&apos;m submitting this for someone else</span>
                <span className="block text-grey-700">They are credited as the author. You still manage the submission and get the results e-mail.</span>
              </span>
            </label>
            {behalf ? (
              <div className="space-y-3 rounded-brand bg-grey-100/70 p-4">
                <div className="inline-flex rounded-brand border border-border bg-white p-0.5 text-sm font-semibold" role="radiogroup" aria-label="Does the author have an account?">
                  {([["guest", "They don't have an account"], ["account", "They have an account"]] as const).map(([k, label]) => (
                    <button key={k} type="button" role="radio" aria-checked={behalfKind === k} onClick={() => { setBehalfKind(k); clearErr("behalf"); }} className={`rounded px-3 py-1.5 ${behalfKind === k ? "bg-maroon text-white" : "text-grey-700 hover:bg-grey-100"}`}>{label}</button>
                  ))}
                </div>
                {behalfKind === "account" ? (
                  behalfUser ? (
                    <div className="inline-flex items-center gap-2 rounded-full border border-border bg-white py-1 pl-1 pr-2 text-sm">
                      <Avatar userId={behalfUser.id} name={behalfUser.name} hasAvatar={behalfUser.avatarVersion !== null} version={behalfUser.avatarVersion} size={24} />
                      <span className="font-heading font-medium text-ink">{behalfUser.name}</span>
                      <span className="hidden text-xs text-grey-600 sm:inline">· {behalfUser.affiliation}</span>
                      <button type="button" onClick={() => setBehalfUser(null)} className="rounded-full p-0.5 text-grey-500 hover:bg-grey-100 hover:text-danger" aria-label={`Remove ${behalfUser.name}`}><X className="size-3.5" /></button>
                    </div>
                  ) : (
                    <UserPickerDialog title="Who is the author?" exclude={collabs.map((c) => c.id)} onAdd={async (u) => { setBehalfUser(u); setCollabs((l) => l.filter((x) => x.id !== u.id)); clearErr("behalf"); }}
                      trigger={<Button type="button" variant="outline" size="sm"><Users /> Choose their account</Button>} />
                  )
                ) : (
                  <div className="flex flex-wrap items-start gap-4">
                    <label className="group/photo relative cursor-pointer" title="Add a photo (optional)">
                      <Avatar userId="" name={behalfName || "Author"} hasAvatar={false} src={behalfPhoto} size={64} />
                      <span className="absolute -bottom-1 -right-1 rounded-full border border-border bg-white p-1 text-grey-700 shadow-sm group-hover/photo:text-maroon"><Camera className="size-3.5" /></span>
                      <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={async (e) => { const f = e.currentTarget.files?.[0]; if (f) setBehalfPhoto(await resizeAvatar(f).catch(() => null)); }} />
                    </label>
                    <div className="grid min-w-0 flex-1 gap-3 sm:grid-cols-2">
                      <div>
                        <Label htmlFor="behalfName" required>Author&apos;s full name</Label>
                        <Input id="behalfName" value={behalfName} maxLength={120} onChange={(e) => { setBehalfName(e.currentTarget.value); clearErr("behalf"); }} placeholder="e.g. Bongseok Kim" />
                      </div>
                      <div>
                        <Label htmlFor="behalfAffil">Affiliation</Label>
                        <Input id="behalfAffil" value={behalfAffil} maxLength={160} onChange={(e) => setBehalfAffil(e.currentTarget.value)} placeholder="e.g. KAIST" />
                      </div>
                      <p className="text-xs text-grey-600 sm:col-span-2">{behalfPhoto ? <>Photo added. <button type="button" className="text-maroon underline" onClick={() => setBehalfPhoto(null)}>Remove</button></> : "Photo optional: click the circle to add one."}</p>
                    </div>
                  </div>
                )}
                {behalfKind === "account" ? <p className="text-xs text-grey-600">They get the usual co-author invitation once you press <strong>Notify</strong> after submitting, and are shown as the author when they accept. Until then the entry shows you.</p> : null}
                <label className="flex items-start gap-2 text-sm text-grey-800">
                  <Checkbox checked={showMe} onCheckedChange={(v) => setShowMe(v === true)} />
                  <span>Also show me as a co-author <span className="text-grey-600">(off: your name stays off the leaderboard and your profile)</span></span>
                </label>
                <FieldError>{errors.behalf}</FieldError>
              </div>
            ) : null}

            <div>
              <p className="text-sm text-grey-700">Co-authors with an account appear beside the model and can see it while private. Nobody is e-mailed yet: after submitting you review the list and press <strong>Notify</strong>.</p>
              {collabs.length ? (
                <ul className="mt-2 flex flex-wrap gap-2">
                  {collabs.map((c) => (
                    <li key={c.id} className="inline-flex items-center gap-2 rounded-full border border-border py-1 pl-1 pr-2 text-sm">
                      <Avatar userId={c.id} name={c.name} hasAvatar={c.avatarVersion !== null} version={c.avatarVersion} size={24} />
                      <span className="font-heading font-medium text-ink">{c.name}</span>
                      <span className="hidden text-xs text-grey-600 sm:inline">· {c.affiliation}</span>
                      <button type="button" onClick={() => setCollabs((l) => l.filter((x) => x.id !== c.id))} className="rounded-full p-0.5 text-grey-500 hover:bg-grey-100 hover:text-danger" aria-label={`Remove ${c.name}`}><X className="size-3.5" /></button>
                    </li>
                  ))}
                </ul>
              ) : null}
              <UserPickerDialog
                exclude={[...collabs.map((c) => c.id), ...(behalfUser ? [behalfUser.id] : [])]}
                onAdd={async (u) => {
                  if (collabs.length >= 10) throw new Error("At most 10 collaborators.");
                  setCollabs((l) => (l.some((x) => x.id === u.id) ? l : [...l, u]));
                }}
                trigger={<Button type="button" variant="outline" size="sm" className="mt-2"><Users /> {collabs.length ? "Add another co-author" : "Add co-authors"}</Button>}
              />
            </div>
          </div>
        </details>
      </section>

      {/* submit */}
      <section className="p-6 md:p-8">
        <label className="flex items-start gap-3 text-sm">
          <Checkbox name="acceptTerms" checked={acceptTerms} onCheckedChange={(v) => { setAcceptTerms(v === true); clearErr("acceptTerms"); }} aria-invalid={!!errors.acceptTerms} />
          <span className="text-grey-800">I confirm the model was developed using only the open portion of the dataset or other public data, and I accept the <a href="/terms" className="text-maroon underline" target="_blank">submission terms</a>. {behalf && !showMe ? "The author's name and affiliation will appear beside public results." : "My name and affiliation will appear beside public results."}</span>
        </label>
        <FieldError>{errors.acceptTerms}</FieldError>
        {Object.keys(errors).some((k) => errors[k]) ? <Alert variant="danger" className="mt-4">{errors.form ?? "Please fix the highlighted fields; everything you entered has been kept."}</Alert> : null}
        <div className="mt-5 flex flex-wrap items-center gap-4">
          <SubmitButton size="lg">Submit for evaluation</SubmitButton>
          <p className="text-sm text-grey-600">The package is checked instantly and queued; results arrive by e-mail.</p>
        </div>
      </section>
    </form>
  );
}
