"use client";

import { useActionState } from "react";
import { sendContactAction, type ContactState } from "./actions";
import { Field, SubmitButton } from "@/components/forms/field";
import { Alert } from "@/components/ui/misc";

export function ContactForm({ name, email }: { name: string; email: string }) {
  const [state, action] = useActionState<ContactState, FormData>(sendContactAction, {});
  if (state.ok) return <Alert variant="success" title="Message sent">Thanks — an administrator will get back to you by email.</Alert>;
  return (
    <form action={action} className="card space-y-4 p-6" noValidate>
      {state.errors?.form ? <Alert variant="danger">{state.errors.form}</Alert> : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name" name="name" required defaultValue={state.values?.name ?? name} error={state.errors?.name} />
        <Field label="Email" name="email" type="email" required defaultValue={state.values?.email ?? email} error={state.errors?.email} />
      </div>
      <Field label="Subject" name="subject" required defaultValue={state.values?.subject} error={state.errors?.subject} />
      <Field label="Message" name="body" textarea rows={7} required defaultValue={state.values?.body} error={state.errors?.body} />
      <SubmitButton>Send message</SubmitButton>
    </form>
  );
}
