"use client";

import { useActionState } from "react";
import { resendVerificationAction, type ActionState } from "../actions";
import { Input } from "@/components/ui/input";
import { SubmitButton } from "@/components/forms/field";

export function ResendForm({ defaultEmail }: { defaultEmail?: string }) {
  const [state, action] = useActionState<ActionState, FormData>(resendVerificationAction, {});
  return (
    <form action={action} className="mx-auto mt-6 flex max-w-sm gap-2">
      <Input name="email" type="email" placeholder="you@university.edu" defaultValue={defaultEmail} required aria-label="Email" />
      <SubmitButton variant="secondary">Resend</SubmitButton>
      {state.message ? <p className="sr-only" role="status">{state.message}</p> : null}
    </form>
  );
}
