import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/ui/misc";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Help & FAQ" };

const SECTIONS: { title: string; items: { q: string; a: React.ReactNode }[] }[] = [
  {
    title: "Submitting a model",
    items: [
      { q: "What does the submission process look like?", a: <>Create an account and verify your email. Package your estimator as a .zip (see <Link href="/docs#submission-format" className="text-maroon underline">submission format</Link>), use <em>Test your package first</em> on the Submit page, then upload it on the <Link href="/submit" className="text-maroon underline">Submit</Link> page with a name, description and model type. The site checks the archive structure immediately and queues the evaluation; you can watch progress on the submission page and will get an email when it finishes.</> },
      { q: "Which files are valid?", a: <>Only a .zip containing <code>Model.m</code>, <code>Model.p</code> or <code>Model.py</code> at the top level, plus any supporting files. No <code>Settings.xlsx</code> is needed (it is ignored if present). Sub-folders or renamed files are rejected before upload completes. The default size limit is 50 MB.</> },
      { q: "Who owns the code I submit?", a: <>You do. The package is used solely to run the blinded evaluation and is deleted once the evaluation completes. Administrators do not view your source through the site. If you need extra assurance, submit <code>Model.p</code> p-code rather than <code>Model.m</code>.</> },
      { q: "Public vs private submissions", a: <>Public submissions appear on the leaderboard with your name and affiliation. Private submissions are evaluated identically but are visible only to you — useful for iterating before you publish a result. You can flip a submission between the two at any time, except contest entries, which must remain public.</> },
      { q: "My evaluation failed. What now?", a: <>Open the submission: the failure message and the evaluator log are shown to you. Typical causes are a NaN output, an error on the first call (initialisation when <code>nargin &lt; 2</code>), a missing supporting file, or use of an unavailable toolbox. Fix the package, check it with <em>Test your package first</em>, and use <em>Re-run</em> or submit again.</> },
      { q: "How long does evaluation take?", a: <>Usually a few minutes; heavy models can take up to an hour. Jobs run in order of submission. If nothing has happened after 24 hours, <Link href="/contact" className="text-maroon underline">contact us</Link> with your submission number.</> },
    ],
  },
  {
    title: "Leaderboard & results",
    items: [
      { q: "How is the ranking computed?", a: <>By <strong>weighted error</strong> — the weighted mean of the test-case RMSE values with the published weights. See <Link href="/docs#metrics" className="text-maroon underline">Metrics &amp; weighted score</Link>. Sorting a column does not change the rank badges.</> },
      { q: "Can I download results?", a: <>Yes: the leaderboard and any per-cycle table export CSV, and each submission page offers a JSON with all test cases, per-cycle errors and time series.</> },
      { q: "Can I compare two models on the same drive cycle?", a: <>Use <Link href="/compare" className="text-maroon underline">Compare</Link> — choose up to four models to overlay their test-case bars, temperature sensitivity and SOC traces. The URL is shareable.</> },
    ],
  },
  {
    title: "Contests",
    items: [
      { q: "How do contests work?", a: <>A contest is a time-boxed challenge with its own leaderboard. Register on the contest page, then choose the contest when submitting. Each participant has a submission limit; the best weighted error counts. Standings freeze at the deadline.</> },
      { q: "Am I eligible?", a: <>Eligibility and prize rules are stated on each contest page under <em>Rules &amp; eligibility</em>. Members of the organising lab may participate but not receive prizes.</> },
    ],
  },
  {
    title: "Account",
    items: [
      { q: "Account verification", a: <>After registering you receive a verification link valid for 24 hours. You cannot sign in until it is used. Use <em>Resend verification email</em> on the sign-in page if it expired or never arrived (check spam).</> },
      { q: "Forgot password", a: <>Use <Link href="/forgot-password" className="text-maroon underline">Forgot password</Link>; the reset link is valid for one hour.</> },
      { q: "Changing my name or affiliation", a: <>Edit them on your <Link href="/profile" className="text-maroon underline">profile</Link>. Public results display the current values.</> },
    ],
  },
];

export default function HelpPage() {
  return (
    <>
      <PageHeader eyebrow="Support" title="Help & FAQ" description="Answers to the common questions about submitting, evaluation, the leaderboard and your account. New to the field? Start with the guide and glossary." actions={<><Button asChild variant="secondary"><Link href="/getting-started">Get-started guide</Link></Button><Button asChild variant="outline"><Link href="/glossary">Glossary</Link></Button><Button asChild variant="secondary"><Link href="/contact">Contact an administrator</Link></Button></>} />
      <div className="container-site grid gap-10 py-10 lg:grid-cols-[220px_1fr]">
        <nav className="lg:sticky lg:top-24 lg:self-start" aria-label="Sections">
          <ul className="space-y-1 text-sm">{SECTIONS.map((s) => <li key={s.title}><a href={`#${s.title.toLowerCase().replace(/[^a-z]+/g, "-")}`} className="block rounded-brand px-2 py-1.5 text-grey-800 hover:bg-grey-100 hover:text-maroon">{s.title}</a></li>)}</ul>
        </nav>
        <div className="max-w-3xl space-y-10">
          {SECTIONS.map((s) => (
            <section key={s.title} id={s.title.toLowerCase().replace(/[^a-z]+/g, "-")}>
              <h2 className="font-heading text-xl font-bold">{s.title}</h2>
              <Accordion type="multiple" className="mt-2">
                {s.items.map((it, i) => (
                  <AccordionItem key={i} value={`${s.title}-${i}`}>
                    <AccordionTrigger>{it.q}</AccordionTrigger>
                    <AccordionContent>{it.a}</AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </section>
          ))}
        </div>
      </div>
    </>
  );
}
