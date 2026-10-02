"use client";

import * as React from "react";
import Link from "next/link";
import { useActionState } from "react";
import ReactMarkdown from "react-markdown";
import { Check, Download, ExternalLink, Plus, Trash2, X } from "lucide-react";
import { saveContestAction, deleteContestAction, type ContestFormState } from "../../actions";
import { Field, SubmitButton } from "@/components/forms/field";
import { Label, NativeSelect, FieldError, Hint, Textarea } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/misc";
import { Dialog, DialogContent, DialogFooter, DialogTrigger, DialogClose } from "@/components/ui/dialog";
import { ELIGIBILITY, RUNTIME_LABEL, starterRules, type Prize } from "@/lib/contest";
import { SITE_TZ, cn } from "@/lib/utils";

export type ContestDraft = {
  id: string;
  title: string;
  slug: string;
  summary: string;
  description: string;
  rules: string;
  /** "YYYY-MM-DDTHH:mm" in site time */
  startsAt: string;
  endsAt: string;
  registrationEndsAt: string;
  maxSubmissionsPerUser: number;
  maxTeamSize: number;
  eligibility: string;
  eligibilityNote: string;
  allowedRuntimes: string[];
  prizes: Prize[];
  status: string;
};

const STEPS = [
  { key: "basics", label: "Basics", fields: ["title", "slug", "summary"] },
  { key: "schedule", label: "Schedule", fields: ["startsAt", "endsAt", "registrationEndsAt"] },
  { key: "prizes", label: "Prizes", fields: ["prizes"] },
  { key: "rules", label: "Entry rules", fields: ["maxSubmissionsPerUser", "maxTeamSize", "eligibility", "eligibilityNote", "allowedRuntimes"] },
  { key: "text", label: "Description & rules", fields: ["description", "rules"] },
  { key: "review", label: "Review", fields: [] },
] as const;

const slugify = (t: string) => t.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
const tzName = new Intl.DateTimeFormat("en-CA", { timeZone: SITE_TZ, timeZoneName: "short" }).formatToParts(new Date()).find((p) => p.type === "timeZoneName")?.value ?? SITE_TZ;

function days(a: string, b: string) {
  const d = (Date.parse(b) - Date.parse(a)) / 86_400_000;
  return Number.isFinite(d) && d > 0 ? Math.round(d * 10) / 10 : null;
}

export function ContestForm({ contest, entriesCsv, entryCount }: { contest: ContestDraft | null; entriesCsv: string; entryCount: number }) {
  const [state, action] = useActionState<ContestFormState, FormData>(saveContestAction, {});
  const [c, setC] = React.useState<ContestDraft>(
    contest ?? {
      id: "", title: "", slug: "", summary: "", description: "", rules: "", startsAt: "", endsAt: "", registrationEndsAt: "",
      maxSubmissionsPerUser: 5, maxTeamSize: 1, eligibility: "ANYONE", eligibilityNote: "", allowedRuntimes: [],
      prizes: [{ label: "1st place", amount: "" }, { label: "2nd place", amount: "" }, { label: "3rd place", amount: "" }], status: "DRAFT",
    },
  );
  const [slugTouched, setSlugTouched] = React.useState(!!contest);
  const [step, setStep] = React.useState(0);
  const set = <K extends keyof ContestDraft>(k: K, v: ContestDraft[K]) => setC((p) => ({ ...p, [k]: v }));
  const err = state.errors ?? {};

  // after a failed save, open the first step that has a problem
  React.useEffect(() => {
    if (!state.errors) return;
    const keys = Object.keys(state.errors);
    const i = STEPS.findIndex((s) => (s.fields as readonly string[]).some((f) => keys.some((k) => k === f || k.startsWith(`${f}.`))));
    if (i >= 0) setStep(i);
  }, [state.errors]);

  const stepHasError = (i: number) => (STEPS[i].fields as readonly string[]).some((f) => Object.keys(err).some((k) => (k === f || k.startsWith(`${f}.`)) && err[k]));
  const published = c.status !== "DRAFT";
  const download = () => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([entriesCsv], { type: "text/csv" }));
    a.download = `${c.slug}-registrations.csv`;
    a.click();
  };

  return (
    <form action={action} className="mt-4" noValidate>
      {c.id ? <input type="hidden" name="id" value={c.id} /> : null}
      {state.errors?.form ? <Alert variant="danger" className="mb-4">{state.errors.form}</Alert> : null}

      <ol className="mb-4 flex flex-wrap gap-2" aria-label="Steps">
        {STEPS.map((s, i) => (
          <li key={s.key}>
            <button
              type="button"
              onClick={() => setStep(i)}
              aria-current={step === i ? "step" : undefined}
              className={cn(
                "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 font-heading text-sm font-semibold transition-colors",
                step === i ? "border-maroon bg-maroon text-white" : "border-border bg-white text-grey-700 hover:border-maroon hover:text-maroon",
                stepHasError(i) && step !== i && "border-danger text-danger",
              )}
            >
              <span className={cn("flex size-5 items-center justify-center rounded-full text-xs", step === i ? "bg-white/20" : "bg-grey-100")}>{i + 1}</span>
              {s.label}
            </button>
          </li>
        ))}
      </ol>

      <div className="card space-y-5 p-6">
        {/* 1. Basics */}
        <section className={cn("space-y-5", step !== 0 && "hidden")}>
          <div className="grid gap-5 md:grid-cols-2">
            <Field label="Title" name="title" required value={c.title} error={err.title} placeholder="2027 Battery SOC Estimation Challenge"
              onChange={(e) => { const t = e.currentTarget.value; setC((p) => ({ ...p, title: t, slug: slugTouched ? p.slug : slugify(t) })); }} />
            <Field label="URL slug" name="slug" required value={c.slug} error={err.slug} hint={`batterysocbenchmark.ca/contest/${c.slug || "…"}`}
              onChange={(e) => { setSlugTouched(true); set("slug", e.currentTarget.value.toLowerCase()); }} />
          </div>
          <Field label="Summary" name="summary" textarea rows={2} required value={c.summary} error={err.summary} maxLength={300}
            hint={`Shown on the homepage, the contest list and the top of the contest page. ${c.summary.length}/300`} onChange={(e) => set("summary", e.currentTarget.value)} />
        </section>

        {/* 2. Schedule */}
        <section className={cn("space-y-5", step !== 1 && "hidden")}>
          <p className="text-sm text-grey-700">Times are Toronto time ({tzName}). Once published, the contest opens and closes itself at these times; nothing has to be switched by hand.</p>
          <div className="grid gap-5 md:grid-cols-2">
            <Field label="Opens" name="startsAt" type="datetime-local" required value={c.startsAt} error={err.startsAt} onChange={(e) => set("startsAt", e.currentTarget.value)} />
            <Field label="Deadline" name="endsAt" type="datetime-local" required value={c.endsAt} error={err.endsAt} onChange={(e) => set("endsAt", e.currentTarget.value)}
              hint={days(c.startsAt, c.endsAt) ? `Runs ${days(c.startsAt, c.endsAt)} days. The standings freeze here.` : "The standings freeze here."} />
          </div>
          <div className="max-w-md">
            <Field label="Registration closes (optional)" name="registrationEndsAt" type="datetime-local" value={c.registrationEndsAt} error={err.registrationEndsAt}
              onChange={(e) => set("registrationEndsAt", e.currentTarget.value)} hint="Leave empty to accept registrations until the deadline. Registration opens as soon as the contest is published." />
          </div>
        </section>

        {/* 3. Prizes */}
        <section className={cn("space-y-4", step !== 2 && "hidden")}>
          <p className="text-sm text-grey-700">One row per place, in order. Winners are picked from the frozen standings after the deadline. Leave the list empty for a contest without prizes.</p>
          <ul className="space-y-2">
            {c.prizes.map((p, i) => (
              <li key={i} className="grid grid-cols-[1fr_1fr_auto] items-start gap-2">
                <div>
                  <Label htmlFor={`prize-l-${i}`} className="sr-only">Place {i + 1}</Label>
                  <input id={`prize-l-${i}`} name="prizeLabel" value={p.label} placeholder={`${i + 1}${["st", "nd", "rd"][i] ?? "th"} place`} maxLength={40}
                    className="h-10 w-full rounded-brand border border-border px-3 text-sm" onChange={(e) => set("prizes", c.prizes.map((q, j) => (j === i ? { ...q, label: e.currentTarget.value } : q)))} />
                  <FieldError>{err[`prizes.${i}.label`]}</FieldError>
                </div>
                <div>
                  <Label htmlFor={`prize-a-${i}`} className="sr-only">Prize for place {i + 1}</Label>
                  <input id={`prize-a-${i}`} name="prizeAmount" value={p.amount} placeholder="CA$5,000" maxLength={60}
                    className="h-10 w-full rounded-brand border border-border px-3 text-sm" onChange={(e) => set("prizes", c.prizes.map((q, j) => (j === i ? { ...q, amount: e.currentTarget.value } : q)))} />
                  <FieldError>{err[`prizes.${i}.amount`]}</FieldError>
                </div>
                <Button type="button" variant="ghost" size="sm" className="mt-1" aria-label={`Remove place ${i + 1}`} onClick={() => set("prizes", c.prizes.filter((_, j) => j !== i))}><X /></Button>
              </li>
            ))}
          </ul>
          {c.prizes.length < 10 ? (
            <Button type="button" variant="outline" size="sm" onClick={() => set("prizes", [...c.prizes, { label: `${c.prizes.length + 1}${["st", "nd", "rd"][c.prizes.length] ?? "th"} place`, amount: "" }])}><Plus /> Add a place</Button>
          ) : null}
        </section>

        {/* 4. Entry rules */}
        <section className={cn("space-y-5", step !== 3 && "hidden")}>
          <div className="grid gap-5 md:grid-cols-2">
            <Field label="Submissions per entrant" name="maxSubmissionsPerUser" type="number" min={1} max={100} required value={String(c.maxSubmissionsPerUser)} error={err.maxSubmissionsPerUser}
              hint="Failed evaluations do not count." onChange={(e) => set("maxSubmissionsPerUser", Number(e.currentTarget.value))} />
            <Field label="Largest team" name="maxTeamSize" type="number" min={1} max={10} required value={String(c.maxTeamSize)} error={err.maxTeamSize}
              hint={c.maxTeamSize > 1 ? "Registrants name their team members; one account submits for the team." : "1 = individual entries only."} onChange={(e) => set("maxTeamSize", Number(e.currentTarget.value))} />
          </div>
          <div className="grid gap-5 md:grid-cols-2">
            <div>
              <Label htmlFor="eligibility" required>Who can enter</Label>
              <NativeSelect id="eligibility" name="eligibility" value={c.eligibility} onChange={(e) => set("eligibility", e.currentTarget.value)}>
                {Object.entries(ELIGIBILITY).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </NativeSelect>
              <Hint>{ELIGIBILITY[c.eligibility]?.statement ? `Registrants must confirm: "${ELIGIBILITY[c.eligibility].statement}"` : "No eligibility statement at registration."}</Hint>
            </div>
            <Field label="Extra eligibility note (optional)" name="eligibilityNote" value={c.eligibilityNote} error={err.eligibilityNote} maxLength={300}
              placeholder="e.g. Organizers' lab members may enter but cannot win prizes." onChange={(e) => set("eligibilityNote", e.currentTarget.value)} />
          </div>
          <fieldset>
            <legend className="mb-1 font-heading text-sm font-semibold text-ink">Accepted runtimes</legend>
            <div className="flex flex-wrap gap-5">
              {Object.entries(RUNTIME_LABEL).map(([k, label]) => (
                <label key={k} className="flex items-center gap-2 text-sm text-grey-800">
                  <input type="checkbox" name="allowedRuntimes" value={k} className="size-4 accent-[#7a003c]" checked={c.allowedRuntimes.includes(k)}
                    onChange={(e) => set("allowedRuntimes", e.currentTarget.checked ? [...c.allowedRuntimes, k] : c.allowedRuntimes.filter((r) => r !== k))} />
                  {label}
                </label>
              ))}
            </div>
            <Hint>{c.allowedRuntimes.length ? "Packages in other runtimes are refused at submission." : "None ticked = both accepted."}</Hint>
          </fieldset>
        </section>

        {/* 5. Description & rules */}
        <section className={cn("space-y-6", step !== 4 && "hidden")}>
          <MarkdownField label="Description" name="description" value={c.description} error={err.description} onChange={(v) => set("description", v)}
            hint="The About tab: the challenge, the data, what makes a good entry. Markdown." />
          <MarkdownField label="Rules & eligibility" name="rules" value={c.rules} error={err.rules} onChange={(v) => set("rules", v)} hint="The Rules tab. Markdown."
            extra={<Button type="button" variant="outline" size="sm" onClick={() => { if (!c.rules.trim() || window.confirm("Replace the current rules with the starter text?")) set("rules", starterRules(c)); }}>Fill in starter rules</Button>} />
        </section>

        {/* 6. Review */}
        <section className={cn("space-y-5", step !== 5 && "hidden")}>
          <dl className="grid gap-x-8 gap-y-3 text-sm sm:grid-cols-2">
            <Review label="Title" value={c.title} onEdit={() => setStep(0)} />
            <Review label="Address" value={c.slug ? `/contest/${c.slug}` : ""} onEdit={() => setStep(0)} />
            <Review label="Opens" value={c.startsAt.replace("T", " ")} onEdit={() => setStep(1)} />
            <Review label="Deadline" value={c.endsAt.replace("T", " ")} onEdit={() => setStep(1)} />
            <Review label="Registration closes" value={c.registrationEndsAt ? c.registrationEndsAt.replace("T", " ") : "At the deadline"} onEdit={() => setStep(1)} />
            <Review label="Prizes" value={c.prizes.filter((p) => p.label || p.amount).map((p) => `${p.label}: ${p.amount}`).join(" · ") || "None"} onEdit={() => setStep(2)} />
            <Review label="Entries" value={`${c.maxSubmissionsPerUser} per entrant · ${c.maxTeamSize > 1 ? `teams up to ${c.maxTeamSize}` : "individual"}`} onEdit={() => setStep(3)} />
            <Review label="Who can enter" value={`${ELIGIBILITY[c.eligibility]?.label ?? c.eligibility} · ${c.allowedRuntimes.length ? c.allowedRuntimes.map((r) => (r === "matlab" ? "MATLAB" : "Python")).join(" + ") : "MATLAB + Python"}`} onEdit={() => setStep(3)} />
            <Review label="Description" value={c.description.trim() ? `${c.description.trim().split(/\s+/).length} words` : ""} onEdit={() => setStep(4)} />
            <Review label="Rules" value={c.rules.trim() ? `${c.rules.trim().split(/\s+/).length} words` : ""} onEdit={() => setStep(4)} />
          </dl>
          <p className="text-sm text-grey-700">
            {c.status === "JUDGED" ? "Results are final; saving updates the text and settings only." : published ? "This contest is published. Saving updates it straight away." : "Save as a draft to check the public page first (drafts are visible only to admins), then publish."}
            {c.id ? <> <Link href={`/contest/${c.slug}`} target="_blank" className="inline-flex items-center gap-1 font-semibold text-maroon hover:underline">Open the contest page <ExternalLink className="size-3.5" /></Link></> : null}
          </p>
        </section>

        <div className="flex flex-wrap items-center gap-3 border-t border-border pt-5">
          {step > 0 ? <Button type="button" variant="outline" onClick={() => setStep(step - 1)}>Back</Button> : null}
          {step < STEPS.length - 1 ? <Button type="button" onClick={() => setStep(step + 1)}>Next: {STEPS[step + 1].label}</Button> : null}
          {step === STEPS.length - 1 || c.id ? (
            published ? (
              <>
                <SubmitButton name="intent" value="save" variant={step === STEPS.length - 1 ? "primary" : "secondary"}><Check /> Save changes</SubmitButton>
                {c.status !== "JUDGED" ? <SubmitButton name="intent" value="draft" variant="outline">Unpublish</SubmitButton> : null}
              </>
            ) : (
              <>
                <SubmitButton name="intent" value="draft" variant={step === STEPS.length - 1 ? "secondary" : "outline"}>Save draft</SubmitButton>
                {step === STEPS.length - 1 ? <SubmitButton name="intent" value="publish"><Check /> Publish</SubmitButton> : null}
              </>
            )
          ) : null}
          {c.id ? (
            <div className="ml-auto flex flex-wrap gap-2">
              <Button type="button" variant="outline" onClick={download} disabled={!entryCount}><Download /> {entryCount} registration{entryCount === 1 ? "" : "s"} (CSV)</Button>
              <Dialog>
                <DialogTrigger asChild><Button type="button" variant="danger"><Trash2 /> Delete</Button></DialogTrigger>
                <DialogContent title="Delete contest?" description="Registrations and results are removed; submissions are kept but detached from the contest. Unpublishing is usually enough." size="sm">
                  <DialogFooter>
                    <DialogClose asChild><Button variant="outline">Cancel</Button></DialogClose>
                    <Button variant="danger" onClick={() => deleteContestAction(c.id)}>Delete contest</Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          ) : null}
        </div>
      </div>
    </form>
  );
}

function Review({ label, value, onEdit }: { label: string; value: string; onEdit: () => void }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-border pb-2">
      <div className="min-w-0">
        <dt className="text-xs font-semibold uppercase tracking-wide text-grey-600">{label}</dt>
        <dd className={cn("mt-0.5 break-words", value ? "text-ink" : "text-danger")}>{value || "Missing"}</dd>
      </div>
      <button type="button" onClick={onEdit} className="shrink-0 text-xs font-semibold text-maroon hover:underline">Edit</button>
    </div>
  );
}

function MarkdownField({ label, name, value, error, hint, extra, onChange }: { label: string; name: string; value: string; error?: string; hint?: string; extra?: React.ReactNode; onChange: (v: string) => void }) {
  const [preview, setPreview] = React.useState(false);
  return (
    <div>
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <Label htmlFor={`f-${name}`} required>{label}</Label>
        <div className="flex items-center gap-2">
          {extra}
          <div className="inline-flex rounded-brand border border-border p-0.5 text-xs font-semibold">
            <button type="button" onClick={() => setPreview(false)} className={cn("rounded px-2.5 py-1", !preview ? "bg-maroon text-white" : "text-grey-700")}>Write</button>
            <button type="button" onClick={() => setPreview(true)} className={cn("rounded px-2.5 py-1", preview ? "bg-maroon text-white" : "text-grey-700")}>Preview</button>
          </div>
        </div>
      </div>
      <Textarea id={`f-${name}`} name={name} rows={14} value={value} aria-invalid={!!error} onChange={(e) => onChange(e.currentTarget.value)} className={cn("font-mono text-sm", preview && "hidden")} />
      {preview ? <article className="md min-h-40 rounded-brand border border-border bg-white px-4 py-3">{value.trim() ? <ReactMarkdown>{value}</ReactMarkdown> : <p className="text-grey-600">Nothing to preview yet.</p>}</article> : null}
      <Hint>{hint}</Hint>
      <FieldError>{error}</FieldError>
    </div>
  );
}
