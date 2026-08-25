import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/ui/misc";
import { GLOSSARY } from "@/lib/glossary";

export const metadata: Metadata = { title: "Glossary" };

import { BatteryMedium, Ruler, Database, Cpu } from "lucide-react";

const GROUPS = ["Basics", "Metrics", "Tests & data", "Methods"] as const;
const GROUP_ICONS = { Basics: BatteryMedium, Metrics: Ruler, "Tests & data": Database, Methods: Cpu } as const;

export default function GlossaryPage() {
  return (
    <>
      <PageHeader eyebrow="Reference" title="Glossary" description="Every term used on this site, in plain language. Dotted-underlined words elsewhere on the site link back here." />
      <div className="container-site grid gap-10 py-10 lg:grid-cols-[220px_1fr]">
        <nav className="lg:sticky lg:top-24 lg:self-start" aria-label="Groups">
          <ul className="space-y-1 text-sm">{GROUPS.map((g) => <li key={g}><a href={`#g-${g.replace(/[^a-z]/gi, "")}`} className="block rounded-brand px-2 py-1.5 text-grey-800 hover:bg-grey-100 hover:text-maroon">{g}</a></li>)}</ul>
          <p className="mt-6 text-xs text-grey-600">New here? Read the <Link href="/getting-started" className="text-maroon underline">Get started</Link> guide first.</p>
        </nav>
        <div className="max-w-3xl space-y-10">
          {GROUPS.map((g) => (
            <section key={g} id={`g-${g.replace(/[^a-z]/gi, "")}`}>
              <h2 className="flex items-center gap-3 font-heading text-xl font-bold">
                <span className="flex size-8 items-center justify-center rounded-brand bg-maroon-100 text-maroon">{(() => { const I = GROUP_ICONS[g]; return <I className="size-4" />; })()}</span>
                {g}
              </h2>
              <dl className="mt-3 divide-y divide-border rounded-brand border border-border bg-white">
                {GLOSSARY.filter((e) => e.group === g).map((e) => (
                  <div key={e.key} id={e.key} className="scroll-mt-24 px-5 py-4">
                    <dt className="font-heading font-semibold text-ink">{e.term}</dt>
                    <dd className="mt-1 text-[15px] leading-relaxed text-grey-800">{e.short}{e.long ? <span className="mt-1.5 block text-sm text-grey-700">{e.long}</span> : null}</dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>
      </div>
    </>
  );
}
