"use client";

import * as React from "react";
import { useActionState } from "react";
import { Download, Trash2 } from "lucide-react";
import { saveContestAction, deleteContestAction, type ContestFormState } from "../../actions";
import { Field, SubmitButton } from "@/components/forms/field";
import { Label, NativeSelect, FieldError, Hint } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/misc";
import { Dialog, DialogContent, DialogFooter, DialogTrigger, DialogClose } from "@/components/ui/dialog";

type C = { id: string; title: string; slug: string; summary: string; description: string; rules: string; prizeText: string; startsAt: string; endsAt: string; status: string; maxSubmissionsPerUser: number };

export function ContestForm({ contest, entriesCsv, entryCount }: { contest: C | null; entriesCsv: string; entryCount: number }) {
  const [state, action] = useActionState<ContestFormState, FormData>(saveContestAction, {});
  const v = (k: keyof C) => state.values?.[k] ?? (contest ? String(contest[k]) : "");
  const download = () => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([entriesCsv], { type: "text/csv" }));
    a.download = `${contest?.slug}-registrations.csv`;
    a.click();
  };
  return (
    <form action={action} className="card mt-4 space-y-5 p-6" noValidate>
      {contest ? <input type="hidden" name="id" value={contest.id} /> : null}
      {state.errors?.form ? <Alert variant="danger">{state.errors.form}</Alert> : null}
      <div className="grid gap-5 md:grid-cols-2">
        <Field label="Title" name="title" required defaultValue={v("title")} error={state.errors?.title} />
        <Field label="URL slug" name="slug" required defaultValue={v("slug")} error={state.errors?.slug} hint="/contest/<slug> — lowercase, dashes" />
      </div>
      <Field label="Summary" name="summary" textarea rows={2} required defaultValue={v("summary")} error={state.errors?.summary} hint="One or two sentences shown in listings and the hero." />
      <Field label="Prize text" name="prizeText" required defaultValue={v("prizeText")} error={state.errors?.prizeText} placeholder="CA$5,000 first prize · CA$2,000 second" />
      <div className="grid gap-5 md:grid-cols-4">
        <Field label="Starts" name="startsAt" type="datetime-local" required defaultValue={v("startsAt")} error={state.errors?.startsAt} />
        <Field label="Ends (deadline)" name="endsAt" type="datetime-local" required defaultValue={v("endsAt")} error={state.errors?.endsAt} />
        <div>
          <Label htmlFor="status" required>Status</Label>
          <NativeSelect id="status" name="status" defaultValue={v("status") || "DRAFT"}>
            <option value="DRAFT">Draft (hidden)</option><option value="OPEN">Open</option><option value="CLOSED">Closed</option><option value="JUDGED">Judged</option>
          </NativeSelect>
          <Hint>Only one contest can be Open at a time.</Hint>
          <FieldError>{state.errors?.status}</FieldError>
        </div>
        <Field label="Max submissions / user" name="maxSubmissionsPerUser" type="number" min={1} max={100} required defaultValue={v("maxSubmissionsPerUser") || "5"} error={state.errors?.maxSubmissionsPerUser} />
      </div>
      <Field label="Description (Markdown)" name="description" textarea rows={12} required defaultValue={v("description")} error={state.errors?.description} className="font-mono text-sm" />
      <Field label="Rules & eligibility (Markdown)" name="rules" textarea rows={12} required defaultValue={v("rules")} error={state.errors?.rules} className="font-mono text-sm" />
      <div className="flex flex-wrap items-center gap-3 border-t border-border pt-5">
        <SubmitButton>{contest ? "Save changes" : "Create contest"}</SubmitButton>
        {contest ? <Button type="button" variant="outline" onClick={download} disabled={!entryCount}><Download /> Export {entryCount} registrations</Button> : null}
        {contest ? (
          <Dialog>
            <DialogTrigger asChild><Button type="button" variant="danger" className="ml-auto"><Trash2 /> Delete</Button></DialogTrigger>
            <DialogContent title="Delete contest?" description="Registrations are removed; submissions are kept but detached from the contest." size="sm">
              <DialogFooter>
                <DialogClose asChild><Button variant="outline">Cancel</Button></DialogClose>
                <Button variant="danger" onClick={() => deleteContestAction(contest.id)}>Delete contest</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        ) : null}
      </div>
    </form>
  );
}
