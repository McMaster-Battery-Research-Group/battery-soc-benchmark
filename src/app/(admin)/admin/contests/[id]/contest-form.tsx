"use client";

import * as React from "react";
import Link from "next/link";
import { useActionState } from "react";
import ReactMarkdown from "react-markdown";
import { Check, CircleCheck, CircleAlert, Download, ExternalLink, Plus, Trash2, X, Rocket, CalendarDays, Trophy, Users } from "lucide-react";
import { saveContestAction, deleteContestAction, type ContestFormState } from "../../actions";
import { Field, SubmitButton } from "@/components/forms/field";
import { Label, NativeSelect, FieldError, Hint, Textarea } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/misc";
import { StatusBadge } from "@/components/ui/badge";
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
  { key: "basics", label: "Basics", blurb: "The name people will see, and the address of its page.", fields: ["title", "slug", "summary"] },
  { key: "schedule", label: "Schedule", blurb: "When it opens, when it closes, and until when people can register.", fields: ["startsAt", "endsAt", "registrationEndsAt"] },
  { key: "prizes", label: "Prizes", blurb: "One row per place. Winners are chosen from the frozen standings after the deadline.", fields: ["prizes"] },
  { key: "rules", label: "Entry rules", blurb: "Who may enter, how many entries, in which runtimes. These are enforced automatically.", fields: ["maxSubmissionsPerUser", "maxTeamSize", "eligibility", "eligibilityNote", "allowedRuntimes"] },
  { key: "text", label: "Description & rules", blurb: "The About and Rules tabs of the contest page, in Markdown.", fields: ["description", "rules"] },
  { key: "review", label: "Review", blurb: "Everything in one place before you publish.", fields: [] },
] as const;

const slugify = (t: string) => t.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
const tzName = new Intl.DateTimeFormat("en-CA", { timeZone: SITE_TZ, timeZoneName: "short" }).formatToParts(new Date()).find((p) => p.type === "timeZoneName")?.value ?? SITE_TZ;
const fmtLocal = (s: string) => (s ? new Date(s).toLocaleString("en-CA", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }) : "");

function days(a: string, b: string) {
  const d = (Date.parse(b) - Date.parse(a)) / 86_400_000;
  return Number.isFinite(d) && d > 0 ? Math.round(d * 10) / 10 : null;
}

/** The same requirements the server enforces, checked as you type so the readiness panel is honest. */
function readiness(c: ContestDraft) {
  const prizesOk = c.prizes.every((p) => p.label.trim() && p.amount.trim());
  const datesOk = !!c.startsAt && !!c.endsAt && Date.parse(c.endsAt) > Date.parse(c.startsAt);
  const regOk = !c.registrationEndsAt || (!!c.endsAt && Date.parse(c.registrationEndsAt) <= Date.parse(c.endsAt));
  return [
    { step: 0, label: "Title and address", ok: c.title.trim().length >= 3 && /^[a-z0-9-]{3,60}$/.test(c.slug), hint: "3+ characters; the address is lowercase letters, numbers and dashes" },
    { step: 0, label: "Summary", ok: c.summary.trim().length >= 10, hint: "one or two sentences" },
    { step: 1, label: "Opens before the deadline", ok: datesOk, hint: "both dates, deadline after opening" },
    { step: 1, label: "Registration closes by the deadline", ok: regOk, hint: "or leave it empty" },
    { step: 2, label: c.prizes.length ? `${c.prizes.length} prize${c.prizes.length === 1 ? "" : "s"} filled in` : "Prizes (none is fine)", ok: prizesOk, hint: "every row needs a place and a prize" },
    { step: 4, label: "Description", ok: c.description.trim().length >= 10, hint: "what the contest is about" },
    { step: 4, label: "Rules", ok: c.rules.trim().length >= 10, hint: "use the starter rules if unsure" },
  ];
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
  const checks = readiness(c);
  const ready = checks.every((x) => x.ok);
  const published = c.status !== "DRAFT";
  const dirty = JSON.stringify(c) !== JSON.stringify(contest);

  // after a failed save, open the first step that has a problem
  React.useEffect(() => {
    if (!state.errors) return;
    const keys = Object.keys(state.errors);
    const i = STEPS.findIndex((s) => (s.fields as readonly string[]).some((f) => keys.some((k) => k === f || k.startsWith(`${f}.`))));
    if (i >= 0) setStep(i);
  }, [state.errors]);

  const stepHasError = (i: number) => (STEPS[i].fields as readonly string[]).some((f) => Object.keys(err).some((k) => (k === f || k.startsWith(`${f}.`)) && err[k]));
  const stepDone = (i: number) => i !== STEPS.length - 1 && checks.filter((x) => x.step === i).every((x) => x.ok) && (i !== 3 || true);
  const download = () => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([entriesCsv], { type: "text/csv" }));
    a.download = `${c.slug}-registrations.csv`;
    a.click();
  };
  const ord = (i: number) => `${i + 1}${["st", "nd", "rd"][i] ?? "th"} place`;

  return (
    <form id="contest-form" action={action} className="mt-4" noValidate>
      {c.id ? <input type="hidden" name="id" value={c.id} /> : null}
      {state.errors?.form ? <Alert variant="danger" className="mb-4">{state.errors.form}</Alert> : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0">
          {/* step rail */}
          <ol className="flex flex-wrap items-center gap-x-1 gap-y-2" aria-label="Steps">
            {STEPS.map((s, i) => {
              const active = step === i, done = stepDone(i), bad = stepHasError(i);
              return (
                <li key={s.key} className="flex items-center">
                  <button
                    type="button"
                    onClick={() => setStep(i)}
                    aria-current={active ? "step" : undefined}
                    className={cn("inline-flex items-center gap-2 rounded-full px-3 py-1.5 font-heading text-sm font-semibold transition-colors", active ? "bg-maroon text-white" : "text-grey-700 hover:bg-grey-100", bad && !active && "text-danger")}
                  >
                    <span className={cn("flex size-5 items-center justify-center rounded-full text-[0.6875rem]", active ? "bg-white/20 text-white" : bad ? "bg-danger text-white" : done ? "bg-forest text-white" : "bg-grey-200 text-grey-700")}>
                      {bad && !active ? "!" : done && !active ? <Check className="size-3" /> : i + 1}
                    </span>
                    {s.label}
                  </button>
                  {i < STEPS.length - 1 ? <span className="mx-0.5 h-px w-4 bg-border" aria-hidden /> : null}
                </li>
              );
            })}
          </ol>

          <div className="card mt-4">
            <div className="border-b border-border px-6 py-4">
              <p className="font-heading text-xs font-semibold uppercase tracking-wide text-grey-600">Step {step + 1} of {STEPS.length}</p>
              <h2 className="font-heading text-xl font-bold text-ink">{STEPS[step].label}</h2>
              <p className="mt-0.5 text-sm text-grey-700">{STEPS[step].blurb}</p>
            </div>
            <div className="space-y-5 p-6">
              {/* 1. Basics */}
              <section className={cn("space-y-5", step !== 0 && "hidden")}>
                <div className="grid gap-5 md:grid-cols-2">
                  <Field label="Title" name="title" required value={c.title} error={err.title} placeholder="2027 Battery SOC Estimation Challenge"
                    onChange={(e) => { const t = e.currentTarget.value; setC((p) => ({ ...p, title: t, slug: slugTouched ? p.slug : slugify(t) })); }} />
                  <Field label="Page address" name="slug" required value={c.slug} error={err.slug} hint={`batterysocbenchmark.ca/contest/${c.slug || "…"}`}
                    onChange={(e) => { setSlugTouched(true); set("slug", e.currentTarget.value.toLowerCase()); }} />
                </div>
                <Field label="Summary" name="summary" textarea rows={2} required value={c.summary} error={err.summary} maxLength={300}
                  hint={`Shown on the homepage, the contest list and the top of the contest page. ${c.summary.length}/300`} onChange={(e) => set("summary", e.currentTarget.value)} />
              </section>

              {/* 2. Schedule */}
              <section className={cn("space-y-5", step !== 1 && "hidden")}>
                <Alert variant="info">Times are Toronto time ({tzName}). Once published, the contest opens and closes itself at these times; nothing needs switching by hand.</Alert>
                <div className="grid gap-5 md:grid-cols-2">
                  <Field label="Opens" name="startsAt" type="datetime-local" required value={c.startsAt} error={err.startsAt} onChange={(e) => set("startsAt", e.currentTarget.value)} hint="Submissions are accepted from this moment." />
                  <Field label="Deadline" name="endsAt" type="datetime-local" required value={c.endsAt} error={err.endsAt} onChange={(e) => set("endsAt", e.currentTarget.value)}
                    hint={days(c.startsAt, c.endsAt) ? `Runs ${days(c.startsAt, c.endsAt)} days. The standings freeze here.` : "The standings freeze here."} />
                </div>
                <div className="max-w-md">
                  <Field label="Registration closes" name="registrationEndsAt" type="datetime-local" value={c.registrationEndsAt} error={err.registrationEndsAt}
                    onChange={(e) => set("registrationEndsAt", e.currentTarget.value)} hint="Optional. Empty = registrations are accepted until the deadline. Registration opens as soon as the contest is published." />
                </div>
              </section>

              {/* 3. Prizes */}
              <section className={cn("space-y-4", step !== 2 && "hidden")}>
                {c.prizes.length ? (
                  <ul className="divide-y divide-border rounded-brand border border-border">
                    {c.prizes.map((p, i) => (
                      <li key={i} className="grid grid-cols-[1fr_1fr_auto] items-start gap-3 px-3 py-2.5">
                        <div>
                          <Label htmlFor={`prize-l-${i}`} className="text-xs">Place</Label>
                          <input id={`prize-l-${i}`} name="prizeLabel" value={p.label} placeholder={ord(i)} maxLength={40}
                            className="h-10 w-full rounded-brand border border-border px-3 text-sm" onChange={(e) => set("prizes", c.prizes.map((q, j) => (j === i ? { ...q, label: e.currentTarget.value } : q)))} />
                          <FieldError>{err[`prizes.${i}.label`]}</FieldError>
                        </div>
                        <div>
                          <Label htmlFor={`prize-a-${i}`} className="text-xs">Prize</Label>
                          <input id={`prize-a-${i}`} name="prizeAmount" value={p.amount} placeholder="CA$5,000" maxLength={60}
                            className="h-10 w-full rounded-brand border border-border px-3 text-sm" onChange={(e) => set("prizes", c.prizes.map((q, j) => (j === i ? { ...q, amount: e.currentTarget.value } : q)))} />
                          <FieldError>{err[`prizes.${i}.amount`]}</FieldError>
                        </div>
                        <Button type="button" variant="ghost" size="sm" className="mt-6" aria-label={`Remove place ${i + 1}`} onClick={() => set("prizes", c.prizes.filter((_, j) => j !== i))}><X /></Button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="rounded-brand border border-dashed border-border px-4 py-6 text-center text-sm text-grey-600">No prizes. The contest page shows standings only.</p>
                )}
                {c.prizes.length < 10 ? (
                  <Button type="button" variant="outline" size="sm" onClick={() => set("prizes", [...c.prizes, { label: ord(c.prizes.length), amount: "" }])}><Plus /> Add a place</Button>
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
                  <Field label="Extra eligibility note" name="eligibilityNote" value={c.eligibilityNote} error={err.eligibilityNote} maxLength={300}
                    placeholder="e.g. Organizers' lab members may enter but cannot win prizes." hint="Optional. Shown in the registration dialog." onChange={(e) => set("eligibilityNote", e.currentTarget.value)} />
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
                  hint="The About tab: the challenge, the data, what makes a good entry." />
                <MarkdownField label="Rules & eligibility" name="rules" value={c.rules} error={err.rules} onChange={(v) => set("rules", v)} hint="The Rules tab."
                  extra={<Button type="button" variant="outline" size="sm" onClick={() => { if (!c.rules.trim() || window.confirm("Replace the current rules with the starter text?")) set("rules", starterRules(c)); }}>Fill in starter rules</Button>} />
              </section>

              {/* 6. Review */}
              <section className={cn("space-y-5", step !== 5 && "hidden")}>
                <dl className="grid gap-x-8 gap-y-3 text-sm sm:grid-cols-2">
                  <Review label="Title" value={c.title} onEdit={() => setStep(0)} />
                  <Review label="Address" value={c.slug ? `/contest/${c.slug}` : ""} onEdit={() => setStep(0)} />
                  <Review label="Opens" value={fmtLocal(c.startsAt)} onEdit={() => setStep(1)} />
                  <Review label="Deadline" value={fmtLocal(c.endsAt)} onEdit={() => setStep(1)} />
                  <Review label="Registration closes" value={c.registrationEndsAt ? fmtLocal(c.registrationEndsAt) : "At the deadline"} onEdit={() => setStep(1)} />
                  <Review label="Prizes" value={c.prizes.filter((p) => p.label || p.amount).map((p) => `${p.label}: ${p.amount}`).join(" · ") || "None"} onEdit={() => setStep(2)} />
                  <Review label="Entries" value={`${c.maxSubmissionsPerUser} per entrant · ${c.maxTeamSize > 1 ? `teams up to ${c.maxTeamSize}` : "individual"}`} onEdit={() => setStep(3)} />
                  <Review label="Who can enter" value={`${ELIGIBILITY[c.eligibility]?.label ?? c.eligibility} · ${c.allowedRuntimes.length ? c.allowedRuntimes.map((r) => (r === "matlab" ? "MATLAB" : "Python")).join(" + ") : "MATLAB + Python"}`} onEdit={() => setStep(3)} />
                  <Review label="Description" value={c.description.trim() ? `${c.description.trim().split(/\s+/).length} words` : ""} onEdit={() => setStep(4)} />
                  <Review label="Rules" value={c.rules.trim() ? `${c.rules.trim().split(/\s+/).length} words` : ""} onEdit={() => setStep(4)} />
                </dl>
              </section>

              <div className="flex items-center justify-between gap-3 border-t border-border pt-5">
                <Button type="button" variant="outline" disabled={step === 0} onClick={() => setStep(step - 1)}>Back</Button>
                {step < STEPS.length - 1 ? <Button type="button" onClick={() => setStep(step + 1)}>Next: {STEPS[step + 1].label}</Button> : <span className="text-sm text-grey-600">Use the panel on the right to save or publish.</span>}
              </div>
            </div>
          </div>
        </div>

        {/* side panel: status, readiness, actions */}
        <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
          <div className="card p-5">
            <div className="flex items-center justify-between gap-2">
              <h3 className="font-heading font-semibold text-ink">{c.id ? "Status" : "New contest"}</h3>
              <StatusBadge status={published ? c.status : "DRAFT"} />
            </div>
            <p className="mt-1 text-sm text-grey-700">
              {c.status === "JUDGED" ? "Results are final. Saving updates the text and settings only." : published ? "Public. Saving applies straight away; the phase follows the dates." : c.id ? "Only administrators can see it. Publish when the checklist is complete." : "Nothing is saved yet."}
            </p>
            <ul className="mt-4 space-y-1.5 text-sm">
              {checks.map((x) => (
                <li key={x.label}>
                  <button type="button" onClick={() => setStep(x.step)} className="flex w-full items-start gap-2 text-left hover:text-maroon">
                    {x.ok ? <CircleCheck className="mt-0.5 size-4 shrink-0 text-forest" /> : <CircleAlert className="mt-0.5 size-4 shrink-0 text-[#9a6a17]" />}
                    <span className={x.ok ? "text-grey-800" : "text-ink"}>{x.label}{!x.ok ? <span className="block text-xs text-grey-600">{x.hint}</span> : null}</span>
                  </button>
                </li>
              ))}
            </ul>
            <div className="mt-5 flex flex-col gap-2 border-t border-border pt-4">
              {published ? (
                <>
                  <SubmitButton name="intent" value="save" disabled={!dirty}><Check /> Save changes</SubmitButton>
                  {c.status !== "JUDGED" ? <SubmitButton name="intent" value="draft" variant="outline">Unpublish</SubmitButton> : null}
                </>
              ) : (
                <>
                  <SubmitButton name="intent" value="draft" variant={ready ? "secondary" : "primary"} disabled={!!c.id && !dirty}><Check /> {c.id ? "Save changes" : "Save as draft"}</SubmitButton>
                  <Dialog>
                    <DialogTrigger asChild><Button type="button" disabled={!ready} title={ready ? undefined : "Complete the checklist first"}><Rocket /> Publish</Button></DialogTrigger>
                    <DialogContent title={`Publish ${c.title || "this contest"}?`} description="It appears on the homepage and the contest list immediately, and opens and closes on the dates below." size="sm">
                      <dl className="space-y-2 text-sm">
                        <div className="flex items-center gap-2"><CalendarDays className="size-4 text-maroon" /><dt className="text-grey-600">Opens</dt><dd className="ml-auto text-ink">{fmtLocal(c.startsAt)}</dd></div>
                        <div className="flex items-center gap-2"><CalendarDays className="size-4 text-maroon" /><dt className="text-grey-600">Deadline</dt><dd className="ml-auto text-ink">{fmtLocal(c.endsAt)}</dd></div>
                        <div className="flex items-center gap-2"><Users className="size-4 text-maroon" /><dt className="text-grey-600">Registration</dt><dd className="ml-auto text-ink">{c.registrationEndsAt ? `until ${fmtLocal(c.registrationEndsAt)}` : "until the deadline"}</dd></div>
                        <div className="flex items-center gap-2"><Trophy className="size-4 text-maroon" /><dt className="text-grey-600">Prizes</dt><dd className="ml-auto text-ink">{c.prizes.length || "none"}</dd></div>
                      </dl>
                      <DialogFooter>
                        <DialogClose asChild><Button variant="outline">Not yet</Button></DialogClose>
                        <SubmitButton form="contest-form" name="intent" value="publish"><Rocket /> Publish now</SubmitButton>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                </>
              )}
              {c.id ? <Button asChild variant="tertiary" size="sm"><Link href={`/contest/${c.slug}`} target="_blank"><ExternalLink /> {published ? "Open the public page" : "Preview the page (admins only)"}</Link></Button> : null}
            </div>
          </div>

          {/* how it reads on the contest list */}
          <div className="card overflow-hidden">
            <p className="border-b border-border px-4 py-2 font-heading text-xs font-semibold uppercase tracking-wide text-grey-600">Preview on the contest list</p>
            <div className="flex">
              <div className="w-24 shrink-0 bg-maroon p-3 text-white">
                <Trophy className="size-5 text-gold" />
                <ul className="mt-2 space-y-0.5 text-[0.6875rem] leading-tight">
                  {c.prizes.filter((p) => p.amount).slice(0, 3).map((p, i) => <li key={i} className="font-heading font-semibold">{p.amount}</li>)}
                </ul>
              </div>
              <div className="min-w-0 flex-1 p-3">
                <p className="truncate font-heading text-sm font-bold text-ink">{c.title || "Contest title"}</p>
                <p className="mt-0.5 line-clamp-2 text-xs text-grey-700">{c.summary || "The summary appears here."}</p>
                <p className="mt-1.5 text-[0.6875rem] text-grey-600">{c.startsAt && c.endsAt ? `${new Date(c.startsAt).toLocaleDateString("en-CA", { month: "short", day: "numeric" })} → ${new Date(c.endsAt).toLocaleDateString("en-CA", { month: "short", day: "numeric", year: "numeric" })}` : "Dates"}</p>
              </div>
            </div>
          </div>

          {c.id ? (
            <div className="card p-4">
              <p className="font-heading text-xs font-semibold uppercase tracking-wide text-grey-600">Registrations</p>
              <p className="mt-1 text-sm text-grey-800">{entryCount} registered</p>
              <div className="mt-3 flex flex-col gap-2">
                <Button type="button" variant="outline" size="sm" onClick={download} disabled={!entryCount}><Download /> Export as CSV</Button>
                <Dialog>
                  <DialogTrigger asChild><Button type="button" variant="ghost" size="sm" className="text-danger hover:bg-danger/5 hover:text-danger"><Trash2 /> Delete contest</Button></DialogTrigger>
                  <DialogContent title="Delete contest?" description="Registrations and results are removed; submissions are kept but detached from the contest. Unpublishing is usually enough." size="sm">
                    <DialogFooter>
                      <DialogClose asChild><Button variant="outline">Cancel</Button></DialogClose>
                      <Button variant="danger" onClick={() => deleteContestAction(c.id)}>Delete contest</Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>
            </div>
          ) : null}
        </aside>
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
      <Hint>{hint} Markdown.</Hint>
      <FieldError>{error}</FieldError>
    </div>
  );
}
