"use client";

import { useActionState } from "react";
import Link from "next/link";
import { loginAction, resendVerificationAction, type ActionState } from "../actions";
import { Field, PasswordField, SubmitButton } from "@/components/forms/field";
import { Alert } from "@/components/ui/misc";

export function LoginForm({ next }: { next?: string }) {
  const [state, action] = useActionState<ActionState, FormData>(loginAction, {});
  const [resend, resendAction] = useActionState<ActionState, FormData>(resendVerificationAction, {});
  const unverified = state.errors?.form === "unverified";

  return (
    <form action={action} className="mt-6 space-y-4" noValidate>
      {next ? <input type="hidden" name="next" value={next} /> : null}
      {unverified ? (
        <Alert variant="warning" title="Email not verified">
          Check your inbox for the verification link.{" "}
          {resend.ok ? (
            <span className="font-medium">{resend.message}</span>
          ) : (
            <button formAction={resendAction} className="font-medium text-maroon underline" type="submit">
              Resend verification email
            </button>
          )}
        </Alert>
      ) : state.errors?.form ? (
        <Alert variant="danger">{state.errors.form}</Alert>
      ) : null}
      <Field label="Email" name="email" type="email" autoComplete="email" required defaultValue={state.values?.email} error={state.errors?.email} />
      <div>
        <PasswordField label="Password" name="password" autoComplete="current-password" required error={state.errors?.password} />
        <div className="mt-1.5 text-right">
          <Link href="/forgot-password" className="text-sm text-maroon underline">Forgot password?</Link>
        </div>
      </div>
      <SubmitButton className="w-full" size="lg">Sign in</SubmitButton>
    </form>
  );
}
