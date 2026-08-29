"use client";

import Link from "next/link";
import { GLOSSARY_BY_KEY } from "@/lib/glossary";
import { Tooltip, TooltipProvider } from "@/components/ui/tooltip";

/** Inline glossary term with a hover/focus definition and a link to the glossary. */
/**
 * Glossary entries are title-cased for the glossary page ("Weighted error", "Coulomb counting"). Inline, mid-sentence,
 * they must read like ordinary words: lower-case the first letter unless the term starts with an acronym (SOC, RMSE)
 * or the entry supplies an explicit `inline` form (proper nouns such as "Kalman filter").
 */
function inlineName(g: { term: string; inline?: string }) {
  if (g.inline) return g.inline;
  return /^[A-Z][a-z]/.test(g.term) ? g.term[0].toLowerCase() + g.term.slice(1) : g.term;
}

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
          {children ?? inlineName(g)}
        </Link>
      </Tooltip>
    </TooltipProvider>
  );
}
