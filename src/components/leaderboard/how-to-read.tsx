"use client";

import Link from "next/link";
import { HelpCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Term } from "@/components/term";

/** A quiet "How to read this table" button in the table toolbar; the explanation opens in a dialog. */
export function HowToRead({ legacyCount = 0, hasPrivate = false }: { legacyCount?: number; hasPrivate?: boolean }) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="text-grey-700"><HelpCircle /> How to read this table</Button>
      </DialogTrigger>
      <DialogContent title="How to read this table" size="lg">
        <div className="grid gap-x-8 gap-y-3 text-sm leading-relaxed text-grey-700 md:grid-cols-2">
          <p><strong className="font-medium text-ink">Every number is an error in % SOC: lower is better.</strong> It is the <Term k="rmse" /> between the model&apos;s estimate and the true state of charge, averaged over a group of hidden test cycles.</p>
          <p><strong className="font-medium text-ink">Rank follows <Term k="weighted-error" />.</strong> It combines all test cases with published weights so cold weather, heavy loads and sensor faults count as much as easy conditions. Sorting other columns doesn&apos;t change the medals.</p>
          <p><strong className="font-medium text-ink">Blinded vs. non-blinded:</strong> &ldquo;Blinded&rdquo; is the error on a cell whose data was never released. If it is much worse than &ldquo;All cells&rdquo;, the model has over-fitted the open data.</p>
          <p><strong className="font-medium text-ink">Complexity</strong> is a cost score from 1 (a few lines of arithmetic) to 10 (heavy). Use <em>Columns</em> to reveal the per-temperature and robustness tests, and click a model name for charts of every cycle. Terms are explained in the <Link href="/glossary" className="text-maroon underline">glossary</Link>.</p>
          {legacyCount ? (
            <p className="border-l-2 border-gold-400 pl-3 md:col-span-2"><strong className="font-semibold text-ink">Legacy-scored rows ({legacyCount}).</strong> Models marked <em>legacy Â· unranked</em> were evaluated by an earlier version of the benchmark, so their numbers are not directly comparable and they receive no rank (they are listed last with a &ldquo;â€”&rdquo;). They regain a rank once the author submits a new version and it is re-evaluated. Untick <em>Include legacy-scored</em> to hide them.</p>
          ) : null}
          {hasPrivate ? (
            <p className="border-l-2 border-grey-300 pl-3 md:col-span-2"><strong className="font-semibold text-ink">Your private models</strong> are hidden from everyone else. Tick <em>Show my private models</em> to see where they <em>would</em> rank (shown as a ghost &ldquo;~N&rdquo;); they never shift the public ranks.</p>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
