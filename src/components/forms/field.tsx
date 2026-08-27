"use client";

import * as React from "react";
import { useFormStatus } from "react-dom";
import { Eye, EyeOff } from "lucide-react";
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

/** Password input with a show/hide toggle (keeps the value; toggles only the input type). */
export function PasswordField({ label, name, error, hint, required, ...props }: { label: string; name: string; error?: string; hint?: React.ReactNode; required?: boolean } & React.InputHTMLAttributes<HTMLInputElement>) {
  const [show, setShow] = React.useState(false);
  const id = `f-${name}`;
  const errId = `${id}-err`;
  return (
    <div>
      <Label htmlFor={id} required={required}>{label}</Label>
      <div className="relative">
        <Input id={id} name={name} type={show ? "text" : "password"} aria-invalid={!!error} aria-describedby={error ? errId : undefined} required={required} className="pr-11" {...props} />
        <button
          type="button"
          onClick={() => setShow((v) => !v)}
          className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-brand text-grey-600 hover:text-maroon focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-maroon/40"
          aria-label={show ? "Hide password" : "Show password"}
          aria-pressed={show}
          tabIndex={-1}
        >
          {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
        </button>
      </div>
      <Hint>{hint}</Hint>
      <span id={errId}><FieldError>{error}</FieldError></span>
    </div>
  );
}
