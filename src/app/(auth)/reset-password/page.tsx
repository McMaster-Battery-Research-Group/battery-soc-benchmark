"use client";

import { useActionState } from "react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { resetPasswordAction, type ActionState } from "../actions";
import { Field, SubmitButton } from "@/components/forms/field";
import { Alert } from "@/components/ui/misc";

function ResetForm() {
  const token = useSearchParams().get("token") ?? "";
  const [state, action] = useActionState<ActionState, FormData>(resetPasswordAction, {});
  return (
    <form action={action} className="mt-6 space-y-4" noValidate>
      <input type="hidden" name="token" value={token} />
      {state.errors?.form ? <Alert variant="danger">{state.errors.form}</Alert> : null}
      <Field label="New password" name="password" type="password" autoComplete="new-password" required error={state.errors?.password} hint="At least 8 characters with upper- and lowercase letters and a number." />
      <Field label="Confirm password" name="confirm" type="password" autoComplete="new-password" required error={state.errors?.confirm} />
      <SubmitButton className="w-full" size="lg">Set new password</SubmitButton>
    </form>
  );
}

export default function ResetPasswordPage() {
  return (
    <div className="card p-6 md:p-8">
      <h1 className="font-heading text-2xl font-bold">Choose a new password</h1>
      <Suspense>
        <ResetForm />
      </Suspense>
    </div>
  );
}
