"use client";

import { useActionState } from "react";
import { sendContactAction, type ContactState } from "./actions";
import { Field, SubmitButton } from "@/components/forms/field";
import { Alert } from "@/components/ui/misc";
import { Label, NativeSelect, FieldError } from "@/components/ui/input";
import { FEEDBACK_CATEGORIES } from "@/lib/validation";

export function ContactForm({ name, email, category, subject, pageUrl }: { name: string; email: string; category?: string; subject?: string; pageUrl?: string }) {
  const [state, action] = useActionState<ContactState, FormData>(sendContactAction, {});
  if (state.ok) return <Alert variant="success" title="Message sent">Thanks — the administrators have been notified and will reply to your email.</Alert>;
  return (
    <form action={action} className="card space-y-4 p-6" noValidate>
      {state.errors?.form ? <Alert variant="danger">{state.errors.form}</Alert> : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name" name="name" required defaultValue={state.values?.name ?? name} error={state.errors?.name} />
        <Field label="Email" name="email" type="email" required defaultValue={state.values?.email ?? email} error={state.errors?.email} />
      </div>
      <div>
        <Label htmlFor="category" required>What is this about?</Label>
        <NativeSelect id="category" name="category" defaultValue={state.values?.category ?? category ?? "question"}>
          {FEEDBACK_CATEGORIES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </NativeSelect>
        <FieldError>{state.errors?.category}</FieldError>
      </div>
      <input type="hidden" name="pageUrl" value={state.values?.pageUrl ?? pageUrl ?? ""} />
      <Field label="Subject" name="subject" required defaultValue={state.values?.subject ?? subject} error={state.errors?.subject} />
      <Field label="Message" name="body" textarea rows={7} required defaultValue={state.values?.body} error={state.errors?.body} hint="For bugs: what you did, what you expected, what happened — and the submission number if there is one." />
      <SubmitButton>Send message</SubmitButton>
    </form>
  );
}
