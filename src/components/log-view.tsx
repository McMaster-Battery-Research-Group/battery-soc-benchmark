"use client";

import * as React from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

/** Collapsible console output that keeps the newest lines in view. */
export function LogView({ title, log, defaultOpen = false, className, maxHeight = "max-h-80" }: { title: string; log: string; defaultOpen?: boolean; className?: string; maxHeight?: string }) {
  const [open, setOpen] = React.useState(defaultOpen);
  const ref = React.useRef<HTMLPreElement>(null);
  React.useEffect(() => {
    if (open && ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [open, log]);
  return (
    <div className={cn("mt-4", className)}>
      <button type="button" onClick={() => setOpen((v) => !v)} className="inline-flex items-center gap-1 font-heading text-sm font-medium text-maroon hover:underline" aria-expanded={open}>
        <ChevronDown className={`size-4 transition-transform ${open ? "rotate-180" : ""}`} /> {title}
      </button>
      {open ? <pre ref={ref} className={cn("mt-2 max-w-full overflow-auto whitespace-pre-wrap break-all rounded-brand bg-grey-900 p-3 text-xs leading-relaxed text-white", maxHeight)}>{log || "(no output yet)"}</pre> : null}
    </div>
  );
}
