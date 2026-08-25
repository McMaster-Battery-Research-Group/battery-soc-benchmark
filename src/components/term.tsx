"use client";

import Link from "next/link";
import { GLOSSARY_BY_KEY } from "@/lib/glossary";
import { Tooltip, TooltipProvider } from "@/components/ui/tooltip";

/** Inline glossary term with a hover/focus definition and a link to the glossary. */
export function Term({ k, children }: { k: string; children?: React.ReactNode }) {
  const g = GLOSSARY_BY_KEY[k];
  if (!g) return <>{children}</>;
  return (
    <TooltipProvider>
      <Tooltip
        content={
          <span>
            <span className="block font-heading font-semibold">{g.term}</span>
            <span className="mt-1 block">{g.short}</span>
          </span>
        }
      >
        <Link href={`/glossary#${g.key}`} className="cursor-help border-b border-dotted border-maroon text-inherit no-underline hover:text-maroon">
          {children ?? g.term}
        </Link>
      </Tooltip>
    </TooltipProvider>
  );
}
