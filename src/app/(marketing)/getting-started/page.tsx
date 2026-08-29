import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, BookOpen, Download, FlaskConical, UploadCloud, Trophy, CheckCircle2 } from "lucide-react";
import { PageHeader } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { Term } from "@/components/term";
import { ModelLoopDiagram, PipelineDiagram } from "@/components/diagrams";

export const metadata: Metadata = { title: "Get started" };

const STEPS = [
  {
    icon: BookOpen, title: "Understand the problem (10 min)",
    body: <>A battery&apos;s <Term k="soc" /> can&apos;t be measured directly — a <Term k="bms" /> only sees current, voltage and temperature and has to <em>estimate</em> how full the pack is. That estimate is hard when it is cold (internal resistance rises ~10×), when the vehicle is heavily loaded, or when the starting SOC is unknown. This benchmark measures how well an <Term k="estimator" /> copes with all of that on real Tesla cells.</>,
    links: [{ href: "/glossary", label: "Read the glossary" }, { href: "/docs#overview", label: "Why a blinded benchmark" }],
  },
  {
    icon: Download, title: "Get the open data (30 min)",
    body: <>Download <em>1-Open Data.zip</em> from Borealis. It contains, for three cells at six temperatures, the characterization tests (<Term k="hppc" />, C/20, C/3, C/2, 1C — use these to build an <Term k="ecm" /> or an <Term k="ocv" /> curve) and eight &ldquo;reordered&rdquo; <Term k="drive-cycle">drive cycles</Term> per temperature (use these to train or validate). Files load in MATLAB as a struct <code className="rounded bg-grey-100 px-1">meas</code> with time, voltage, current, temperature and reference SOC. If you don&apos;t have MATLAB, SciPy&apos;s <code className="rounded bg-grey-100 px-1">loadmat</code> reads them too.</>,
    links: [{ href: "/dataset", label: "What's in the dataset" }],
  },
  {
    icon: FlaskConical, title: "Build your first estimator (1–2 h)",
    body: <>Start from the examples in <em>4-SOC estimation Model Examples.zip</em>. The <Term k="coulomb-counting">coulomb counting</Term> example is 20 lines and is the best way to learn the interface: your function is called once per second with <code className="rounded bg-grey-100 px-1">X = [current, voltage, temperature]</code>, returns SOC in 0–1, and can carry any memory it likes in <code className="rounded bg-grey-100 px-1">z</code>. Then move up to the <Term k="ekf" /> example (uses HPPC parameters) or the LSTM example (trained with the scripts in <em>3-Neural Network Training Example.zip</em>).</>,
    links: [{ href: "/examples", label: "Walk through the four example models" }, { href: "/docs#submission-format", label: "Submission format" }],
  },
  {
    icon: CheckCircle2, title: "Test it on the site (2 min)",
    body: <>Zip <code className="rounded bg-grey-100 px-1">Model.m</code>/<code className="rounded bg-grey-100 px-1">Model.py</code> and any parameter files (no folders, no spreadsheet needed), then use <strong>Test your package first</strong> on the Submit page. It runs your model through the real evaluator on one public drive cycle and tells you exactly what to fix — no MATLAB or local tooling needed, nothing is scored or recorded.</>,
    links: [{ href: "/docs#test-tool", label: "How the test run works" }],
  },
  {
    icon: UploadCloud, title: "Submit and read your results (10 min)",
    body: <>Create an account, upload the zip, and wait for the email. Your submission page shows the <Term k="weighted-error" /> (the leaderboard score), the <Term k="rmse" /> of every <Term k="test-case" />, the worst-case <Term k="maxe">max error</Term>, and charts of estimated vs. true SOC on individual cycles — look at <strong>−20 °C</strong> and <strong>HWGRADE</strong> first; that&apos;s where most models struggle. Use <Link href="/compare" className="text-maroon underline">Compare</Link> to put your model next to the leaders.</>,
    links: [{ href: "/submit", label: "Submit a model" }, { href: "/leaderboard", label: "See the leaderboard" }],
  },
  {
    icon: Trophy, title: "Enter the contest (optional)",
    body: <>Contests are time-boxed and have cash prizes. Register on the contest page, then tick the contest when you submit. Up to five entries each; your best score counts and standings freeze at the deadline.</>,
    links: [{ href: "/contest", label: "Current contest" }],
  },
];

export default function GettingStartedPage() {
  return (
    <>
      <PageHeader eyebrow="New here?" title="Get started with the benchmark" description="A guided path from zero to your first score on the leaderboard — written for students and engineers who are new to battery state-of-charge estimation. Budget an afternoon." actions={<Button asChild><Link href="/register">Create a free account</Link></Button>} />
      <div className="container-site max-w-3xl py-10">
        <PipelineDiagram className="mb-8 hidden sm:block" />
        <div className="card mb-8 p-5 text-[15px] leading-relaxed text-grey-800">
          <p className="font-heading font-semibold text-ink">The benchmark in one paragraph</p>
          <p className="mt-2">Four Tesla Model 3 cells were cycled in a thermal chamber from −20 °C to 40 °C with realistic driving loads. Part of that data is <Term k="open-data">open</Term> for you to build on; the rest is <Term k="blinded" />. You write a small function that estimates SOC from current, voltage and temperature, upload it, and the evaluator runs it on the blinded data. You get back one headline number — the <Term k="weighted-error" /> — plus a breakdown by temperature, load, drive-cycle type and robustness, so you can see exactly where your method is strong or weak, and compare it with everyone else&apos;s on identical terms.</p>
        </div>
        <ol className="space-y-6">
          {STEPS.map((s, i) => (
            <li key={s.title} className="card flex gap-5 p-6">
              <div className="flex shrink-0 flex-col items-center gap-2">
                <span className="flex size-10 items-center justify-center rounded-brand bg-maroon text-white"><s.icon className="size-5" /></span>
                <span className="font-heading text-xs font-semibold text-grey-600">{i + 1}</span>
              </div>
              <div className="min-w-0">
                <h2 className="font-heading text-lg font-semibold">{s.title}</h2>
                <p className="mt-2 text-[15px] leading-relaxed text-grey-800">{s.body}</p>
                {i === 2 ? <ModelLoopDiagram className="mt-4 hidden sm:block" /> : null}
                <div className="mt-3 flex flex-wrap gap-4">
                  {s.links.map((l) => <Link key={l.href} href={l.href} className="inline-flex items-center gap-1 font-heading text-sm font-semibold text-maroon hover:underline">{l.label} <ArrowRight className="size-4" /></Link>)}
                </div>
              </div>
            </li>
          ))}
        </ol>
        <div className="mt-10 rounded-brand border-l-4 border-gold bg-gold-100 p-5 text-sm text-grey-800">
          <p className="font-heading font-semibold text-ink">Reading the leaderboard</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li><strong>Weighted error</strong> decides the rank. It is in % SOC; 3 % is excellent, 10 % is a decent first model, 30 %+ means the estimator is drifting.</li>
            <li><strong>All cells</strong> is the plain average error; <strong>Blinded</strong> is the same on the cell nobody has data for — a big gap between them hints at over-fitting.</li>
            <li><strong>−20 °C</strong>, <strong>Init. SOC</strong> and <strong>I offset</strong> are the stress tests. Open-loop methods fail them; filters and recurrent networks recover.</li>
            <li><strong>Complexity</strong> is a cost score (1 cheap → 10 heavy). A model that is 0.2 % better but 5× more complex is not necessarily a better BMS candidate.</li>
          </ul>
        </div>
      </div>
    </>
  );
}
