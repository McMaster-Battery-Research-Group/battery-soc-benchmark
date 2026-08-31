"use client";

import { useActionState } from "react";
import Link from "next/link";
import { registerAction, type ActionState } from "../actions";
import { Field, PasswordField, SubmitButton } from "@/components/forms/field";
import { Alert } from "@/components/ui/misc";

export function RegisterForm({ affiliations = [] }: { affiliations?: string[] }) {
  const [state, action] = useActionState<ActionState, FormData>(registerAction, {});
  return (
    <form action={action} className="mt-6 space-y-4" noValidate>
      {state.errors?.form ? <Alert variant="danger">{state.errors.form}</Alert> : null}
      <Field label="Full name" name="name" autoComplete="name" required defaultValue={state.values?.name} error={state.errors?.name} />
      <Field label="Email" name="email" type="email" autoComplete="email" required defaultValue={state.values?.email} error={state.errors?.email} hint="Use your institutional email where possible." />
      <datalist id="affiliation-options">{affiliations.map((a) => <option key={a} value={a} />)}</datalist>
      <Field list="affiliation-options" label="Affiliation" name="affiliation" autoComplete="organization" required placeholder="e.g. McMaster University" defaultValue={state.values?.affiliation} error={state.errors?.affiliation} />
      <PasswordField label="Password" name="password" autoComplete="new-password" required error={state.errors?.password} hint="At least 8 characters with upper- and lowercase letters and a number." />
      <PasswordField label="Confirm password" name="confirm" autoComplete="new-password" required error={state.errors?.confirm} />
      <SubmitButton className="w-full" size="lg">Create account</SubmitButton>
      <p className="text-xs text-grey-600">
        By creating an account you agree to the <Link href="/terms" className="text-maroon underline">terms of use</Link>. Submitted model files are used only to run the blinded evaluation and are deleted afterwards.
      </p>
    </form>
  );
}
