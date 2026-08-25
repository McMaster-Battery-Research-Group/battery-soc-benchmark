"use client";

import * as React from "react";
import { useFormStatus } from "react-dom";
import { Input, Textarea, Label, FieldError, Hint } from "@/components/ui/input";
import { Button, type ButtonProps } from "@/components/ui/button";

export function Field({
  label,
  name,
  error,
  hint,
  required,
  textarea,
  ...props
}: {
  label: string;
  name: string;
  error?: string;
  hint?: React.ReactNode;
  required?: boolean;
  textarea?: boolean;
} & React.InputHTMLAttributes<HTMLInputElement> &
  React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const id = `f-${name}`;
  const errId = `${id}-err`;
  return (
    <div>
      <Label htmlFor={id} required={required}>{label}</Label>
      {textarea ? (
        <Textarea id={id} name={name} aria-invalid={!!error} aria-describedby={error ? errId : undefined} required={required} {...props} />
      ) : (
        <Input id={id} name={name} aria-invalid={!!error} aria-describedby={error ? errId : undefined} required={required} {...props} />
      )}
      <Hint>{hint}</Hint>
      <span id={errId}><FieldError>{error}</FieldError></span>
    </div>
  );
}

export function SubmitButton({ children, ...props }: ButtonProps) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" loading={pending} {...props}>
      {children}
    </Button>
  );
}
