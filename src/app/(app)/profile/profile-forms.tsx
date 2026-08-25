"use client";

import { useActionState } from "react";
import { updateProfileAction, changePasswordAction, type ActionState } from "@/app/(auth)/actions";
import { Field, SubmitButton } from "@/components/forms/field";
import { Alert } from "@/components/ui/misc";
import { Badge } from "@/components/ui/badge";

export function ProfileForms({ name, affiliation, email, role }: { name: string; affiliation: string; email: string; role: string }) {
  const [p, pAction] = useActionState<ActionState, FormData>(updateProfileAction, {});
  const [pw, pwAction] = useActionState<ActionState, FormData>(changePasswordAction, {});
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <form action={pAction} className="card p-6" noValidate>
        <h2 className="font-heading text-lg font-semibold">Profile</h2>
        <p className="mt-1 text-sm text-grey-700">Shown next to your public submissions.</p>
        {p.ok ? <Alert variant="success" className="mt-4">{p.message}</Alert> : null}
        <div className="mt-5 space-y-4">
          <Field label="Full name" name="name" defaultValue={name} required error={p.errors?.name} />
          <Field label="Affiliation" name="affiliation" defaultValue={affiliation} required error={p.errors?.affiliation} />
          <div>
            <p className="mb-1.5 font-heading text-sm font-medium text-grey-800">Email</p>
            <p className="flex items-center gap-2 text-sm text-grey-900">{email} <Badge variant={role === "ADMIN" ? "maroon" : "neutral"}>{role === "ADMIN" ? "Administrator" : "Verified"}</Badge></p>
          </div>
        </div>
        <SubmitButton className="mt-6">Save changes</SubmitButton>
      </form>
      <form action={pwAction} className="card p-6" noValidate>
        <h2 className="font-heading text-lg font-semibold">Change password</h2>
        {pw.ok ? <Alert variant="success" className="mt-4">{pw.message}</Alert> : null}
        {pw.errors?.form ? <Alert variant="danger" className="mt-4">{pw.errors.form}</Alert> : null}
        <div className="mt-5 space-y-4">
          <Field label="Current password" name="current" type="password" autoComplete="current-password" required error={pw.errors?.current} />
          <Field label="New password" name="password" type="password" autoComplete="new-password" required error={pw.errors?.password} hint="At least 8 characters with upper- and lowercase letters and a number." />
        </div>
        <SubmitButton className="mt-6" variant="secondary">Update password</SubmitButton>
      </form>
    </div>
  );
}
