"use client";

import * as React from "react";
import Link from "next/link";
import { HelpCircle, ChevronDown } from "lucide-react";
import { Term } from "@/components/term";
import { cn } from "@/lib/utils";

export function HowToRead({ legacyCount = 0, hasPrivate = false }: { legacyCount?: number; hasPrivate?: boolean }) {
  const [open, setOpen] = React.useState(false);
  React.useEffect(() => {
    try {
      setOpen(localStorage.getItem("socbench.howToRead") !== "closed");
    } catch {}
  }, []);
  const toggle = () => {
    setOpen((v) => {
      try {
        localStorage.setItem("socbench.howToRead", v ? "closed" : "open");
      } catch {}
      return !v;
    });
  };
  return (
    <div className="mb-5 rounded-brand border border-border bg-gold-100/70">
      <button onClick={toggle} className="flex w-full items-center gap-2 px-4 py-3 text-left font-heading text-sm font-semibold text-ink" aria-expanded={open}>
        <HelpCircle className="size-4 text-maroon" /> How to read this table
        <ChevronDown className={cn("ml-auto size-4 text-grey-600 transition-transform", open && "rotate-180")} />
      </button>
      {open ? (
        <div className="grid gap-x-8 gap-y-2 border-t border-border/70 px-4 py-4 text-sm text-grey-800 md:grid-cols-2">
          <p><strong className="text-ink">Every number is an error in % SOC — lower is better.</strong> It is the <Term k="rmse" /> between the model&apos;s estimate and the true state of charge, averaged over a group of hidden test cycles.</p>
          <p><strong className="text-ink">Rank follows <Term k="weighted-error" />.</strong> It combines all test cases with published weights so cold weather, heavy loads and sensor faults count as much as easy conditions. Sorting other columns doesn&apos;t change the medals.</p>
          <p><strong className="text-ink">Blinded vs. non-blinded:</strong> &ldquo;Blinded&rdquo; is the error on a cell whose data was never released. If it is much worse than &ldquo;All cells&rdquo;, the model has over-fitted the open data.</p>
          <p><strong className="text-ink">Complexity</strong> is a cost score from 1 (a few lines of arithmetic) to 10 (heavy). Use <em>Columns</em> to reveal the per-temperature and robustness tests, and click a model name for charts of every cycle. Terms are explained in the <Link href="/glossary" className="text-maroon underline">glossary</Link>.</p>
          {legacyCount ? (
            <p className="md:col-span-2 rounded-brand border border-gold-300/70 bg-gold-100 px-3 py-2"><strong className="text-ink">Legacy-scored rows ({legacyCount}).</strong> Models marked <em>legacy · unranked</em> were evaluated by an earlier version of the benchmark, so their numbers are not directly comparable and they receive no rank (they are listed last with a &ldquo;—&rdquo;). They regain a rank once the author submits a new version and it is re-evaluated. Untick <em>Include legacy-scored</em> to hide them.</p>
          ) : null}
          {hasPrivate ? (
            <p className="md:col-span-2"><strong className="text-ink">Your private models</strong> are hidden from everyone else. Tick <em>Show my private models</em> to see where they <em>would</em> rank (shown as a ghost &ldquo;~N&rdquo;); they never shift the public ranks.</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
