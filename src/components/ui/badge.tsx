import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badge = cva("inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 font-heading text-xs font-medium whitespace-nowrap", {
  variants: {
    variant: {
      neutral: "border-border bg-grey-100 text-grey-800",
      maroon: "border-maroon-300 bg-maroon-100 text-maroon-800",
      gold: "border-gold-400 bg-gold-200 text-grey-900",
      success: "border-[#bfe0cf] bg-[#e8f5ee] text-forest",
      warning: "border-[#f2dcb6] bg-[#fdf4e3] text-[#7a4f0e]",
      danger: "border-[#efc3c6] bg-[#fbeaeb] text-danger",
      info: "border-[#bcd8e3] bg-[#e7f2f6] text-bayfront",
      solid: "border-maroon bg-maroon text-white",
    },
  },
  defaultVariants: { variant: "neutral" },
});

export function Badge({ className, variant, ...props }: React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badge>) {
  return <span className={cn(badge({ variant }), className)} {...props} />;
}

export function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { v: VariantProps<typeof badge>["variant"]; label: string; dot?: string }> = {
    QUEUED: { v: "neutral", label: "Queued", dot: "bg-grey-500" },
    RUNNING: { v: "info", label: "Evaluating", dot: "bg-bayfront animate-pulse" },
    COMPLETED: { v: "success", label: "Completed", dot: "bg-forest" },
    FAILED: { v: "danger", label: "Failed", dot: "bg-danger" },
    DRAFT: { v: "neutral", label: "Draft" },
    OPEN: { v: "success", label: "Open", dot: "bg-forest animate-pulse" },
    CLOSED: { v: "warning", label: "Closed" },
    JUDGED: { v: "maroon", label: "Judged" },
  };
  const m = map[status] ?? { v: "neutral" as const, label: status };
  return (
    <Badge variant={m.v}>
      {m.dot ? <span className={cn("size-1.5 rounded-full", m.dot)} aria-hidden /> : null}
      {m.label}
    </Badge>
  );
}
