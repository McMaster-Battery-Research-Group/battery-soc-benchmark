import * as React from "react";
import { AlertTriangle, Info, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";

export function Alert({
  variant = "info",
  title,
  children,
  className,
}: {
  variant?: "info" | "warning" | "success" | "danger";
  title?: string;
  children?: React.ReactNode;
  className?: string;
}) {
  const styles = {
    info: "border-[#bcd8e3] bg-[#eef6f9] text-grey-900",
    warning: "border-gold-400 bg-gold-200 text-grey-900",
    success: "border-[#bfe0cf] bg-[#eaf6ef] text-grey-900",
    danger: "border-[#efc3c6] bg-[#fdf0f1] text-grey-900",
  };
  const Icon = variant === "warning" || variant === "danger" ? AlertTriangle : variant === "success" ? CheckCircle2 : Info;
  const iconColor = { info: "text-bayfront", warning: "text-[#9a6a17]", success: "text-forest", danger: "text-danger" }[variant];
  return (
    <div className={cn("flex gap-3 rounded-brand border p-4 text-sm", styles[variant], className)} role={variant === "danger" ? "alert" : undefined}>
      <Icon className={cn("mt-0.5 size-5 shrink-0", iconColor)} aria-hidden />
      <div className="min-w-0 flex-1">
        {title ? <p className="font-heading font-semibold text-ink">{title}</p> : null}
        {children ? <div className={cn(title && "mt-1")}>{children}</div> : null}
      </div>
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-brand bg-grey-200", className)} />;
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  className,
}: {
  eyebrow?: string;
  title: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("border-b border-border bg-grey-100/60", className)}>
      <div className="container-site flex flex-col gap-5 py-10 md:flex-row md:items-end md:justify-between md:py-14">
        <div className="max-w-3xl">
          {eyebrow ? <p className="mb-2 font-heading text-xs font-semibold uppercase tracking-[0.14em] text-maroon">{eyebrow}</p> : null}
          <h1 className="font-heading text-3xl font-bold leading-tight md:text-[40px] md:leading-[46px]">{title}</h1>
          {description ? <p className="mt-3 max-w-2xl text-[17px] leading-relaxed text-grey-700">{description}</p> : null}
        </div>
        {actions ? <div className="flex shrink-0 flex-wrap gap-2">{actions}</div> : null}
      </div>
    </div>
  );
}

export function SectionTitle({ children, sub, className }: { children: React.ReactNode; sub?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("mb-5", className)}>
      <h2 className="font-heading text-2xl font-bold">{children}</h2>
      {sub ? <p className="mt-1.5 text-grey-700">{sub}</p> : null}
    </div>
  );
}

export function Stat({ label, value, sub, className }: { label: string; value: React.ReactNode; sub?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("card px-5 py-4", className)}>
      <p className="font-heading text-xs font-semibold uppercase tracking-wide text-grey-600">{label}</p>
      <p className="mt-1 font-heading text-3xl font-bold text-ink tabular">{value}</p>
      {sub ? <p className="mt-1 text-sm text-grey-700">{sub}</p> : null}
    </div>
  );
}

export function EmptyState({ icon: Icon, title, description, action }: { icon?: React.ComponentType<{ className?: string }>; title: string; description?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-brand border border-dashed border-border px-6 py-14 text-center">
      {Icon ? <Icon className="mb-3 size-10 text-grey-400" /> : null}
      <p className="font-heading text-lg font-semibold text-ink">{title}</p>
      {description ? <p className="mt-1 max-w-md text-sm text-grey-700">{description}</p> : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}
