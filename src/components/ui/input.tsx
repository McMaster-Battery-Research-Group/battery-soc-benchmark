import * as React from "react";
import { cn } from "@/lib/utils";

const base =
  "w-full rounded-brand border border-border bg-white px-3 text-[15px] text-grey-900 placeholder:text-grey-500 transition-shadow focus:border-maroon focus:shadow-[0_0_0_4px_rgb(219_219_221/0.5)] focus:outline-none disabled:cursor-not-allowed disabled:bg-grey-100 aria-[invalid=true]:border-maroon aria-[invalid=true]:shadow-[0_0_0_4px_rgb(122_0_60/0.12)]";

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => <input ref={ref} className={cn(base, "h-10", className)} {...props} />,
);
Input.displayName = "Input";

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => <textarea ref={ref} className={cn(base, "min-h-24 py-2", className)} {...props} />,
);
Textarea.displayName = "Textarea";

export const NativeSelect = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, children, ...props }, ref) => (
    <select ref={ref} className={cn(base, "h-10 appearance-none bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2216%22 height=%2216%22 fill=%22none%22 stroke=%22%23495965%22 stroke-width=%222%22><path d=%22m4 6 4 4 4-4%22/></svg>')] bg-[length:16px] bg-[right_0.6rem_center] bg-no-repeat pr-9", className)} {...props}>
      {children}
    </select>
  ),
);
NativeSelect.displayName = "NativeSelect";

export function Label({ className, children, required, ...props }: React.LabelHTMLAttributes<HTMLLabelElement> & { required?: boolean }) {
  return (
    <label className={cn("mb-1.5 block font-heading text-sm font-medium text-grey-800", className)} {...props}>
      {children}
      {required ? <span className="ml-0.5 text-maroon" aria-hidden>*</span> : null}
    </label>
  );
}

export function FieldError({ children }: { children?: React.ReactNode }) {
  if (!children) return null;
  return (
    <p className="mt-1.5 text-sm text-danger" role="alert">
      {children}
    </p>
  );
}

export function Hint({ children, className }: { children?: React.ReactNode; className?: string }) {
  if (!children) return null;
  return <p className={cn("mt-1.5 text-xs text-grey-600", className)}>{children}</p>;
}
