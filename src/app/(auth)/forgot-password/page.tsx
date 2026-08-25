"use client";

import { useActionState } from "react";
import Link from "next/link";
import { requestResetAction, type ActionState } from "../actions";
import { Field, SubmitButton } from "@/components/forms/field";
import { Alert } from "@/components/ui/misc";

export default function ForgotPasswordPage() {
  const [state, action] = useActionState<ActionState, FormData>(requestResetAction, {});
  return (
    <div className="card p-6 md:p-8">
      <h1 className="font-heading text-2xl font-bold">Reset your password</h1>
      <p className="mt-1 text-sm text-grey-700">Enter the email you registered with and we&apos;ll send a reset link.</p>
      {state.ok ? (
        <Alert variant="success" className="mt-5">{state.message}</Alert>
      ) : (
        <form action={action} className="mt-6 space-y-4" noValidate>
          <Field label="Email" name="email" type="email" autoComplete="email" required error={state.errors?.email} />
          <SubmitButton className="w-full" size="lg">Send reset link</SubmitButton>
        </form>
      )}
      <p className="mt-6 text-center text-sm">
        <Link href="/login" className="text-maroon underline">Back to sign in</Link>
      </p>
    </div>
  );
}
