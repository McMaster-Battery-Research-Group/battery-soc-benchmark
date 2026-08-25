import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/ui/misc";
import { TEST_CASES, GROUP_LABELS, type TestCaseGroup } from "@/lib/test-cases";
import { Alert } from "@/components/ui/misc";
import { ModelLoopDiagram, PipelineDiagram } from "@/components/diagrams";
import { CodeBlock } from "@/components/code-block";
import { MathBlock } from "@/components/math";
import { Eye, ListChecks, Calculator, FileArchive, FlaskConical, PlayCircle, Quote } from "lucide-react";

const ICONS = { overview: Eye, "test-cases": ListChecks, metrics: Calculator, "submission-format": FileArchive, "test-tool": FlaskConical, evaluation: PlayCircle, citation: Quote } as const;
function H2({ id, children }: { id: keyof typeof ICONS; children: React.ReactNode }) {
  const Icon = ICONS[id];
  return (
    <h2 className="flex items-center gap-3 font-heading text-2xl font-bold">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-brand bg-maroon text-white"><Icon className="size-5" /></span>
      {children}
    </h2>
  );
}

export const metadata: Metadata = { title: "Methodology" };

const TOC = [
  ["overview", "Overview"], ["test-cases", "The blinded test cases"], ["metrics", "Metrics & weighted score"], ["submission-format", "Submission format"], ["test-tool", "Testing before you submit"], ["evaluation", "How evaluation runs"], ["citation", "Citation"],
];

const CC_EXAMPLE = `% SOC Estimation Example V2 — online Coulomb counter
function [Y_est, z] = Model(X, z)
    Current  = X(1);      % A, negative = discharging
    % Voltage  = X(2);    % V   (unused here)
    % Temp     = X(3);    % °C  (unused here)
    Capacity = 4.6;       % Ah

    if nargin == 1        % first sample: initialise memory z
        SOC = 1;          % assume fully charged
    else
        SOC = z + Current*(1/3600)/Capacity;
    end
    z = SOC;              % memory returned to the evaluator
    Y_est = SOC;          % 0 … 1
end`;

const LOOP = `[SOC(1), z] = Model(X(1, :));        % initial call, no z
for i = 2:T
    [SOC(i), z] = Model(X(i, :), z);   % iterative call with state
end`;

export default function DocsPage() {
  const groups: TestCaseGroup[] = ["overview", "conditions", "temperature", "robustness"];
  return (
    <>
      <PageHeader eyebrow="Documentation" title="Methodology & submission guide" description="How the blinded evaluation works, what each test case measures, how the weighted score is computed, and exactly what to put in your submission package. Mirrors the Blind Modeling Tool V2 documentation shipped with the dataset." />
      <div className="container-site grid gap-10 py-10 lg:grid-cols-[220px_1fr]">
        <nav className="lg:sticky lg:top-24 lg:self-start" aria-label="On this page">
          <p className="mb-2 font-heading text-xs font-semibold uppercase tracking-[0.14em] text-maroon">On this page</p>
          <ul className="space-y-1 text-sm">
            {TOC.map(([id, l]) => <li key={id}><a href={`#${id}`} className="block rounded-brand px-2 py-1.5 text-grey-800 hover:bg-grey-100 hover:text-maroon">{l}</a></li>)}
          </ul>
        </nav>

        <article className="prose-brand max-w-3xl space-y-14 text-[15px] leading-relaxed text-grey-800">
          <section id="overview">
            <H2 id="overview">Overview</H2>
            <p className="mt-3">Hundreds of SOC estimation methods are published every year, each evaluated on different data, drive profiles and error metrics — which makes them impossible to compare. This tool fixes the data and the test: everyone parameterises or trains on the same <Link href="/dataset">open data</Link>, and every submission is scored on the same blinded data by the same evaluator. Results are directly comparable across authors, methods and years.</p>
            <PipelineDiagram className="mt-5" />
            <p className="mt-3">Blinding matters. The m448 cell is never released, and the standard UDDS / HWFET / LA92 / US06 cycles plus one HWCUST and one HWGRADE cycle per cell and temperature are withheld. An algorithm cannot be tuned to the answer key.</p>
          </section>

          <section id="test-cases">
            <H2 id="test-cases">The blinded test cases</H2>
            <p className="mt-3">Each test case is an average of the per-cycle RMSE (in % SOC) over a subset of the 144 blinded drive cycles (36 per cell: six cycle types at six temperatures). The three headline groups are <strong>estimation accuracy</strong>, <strong>operating conditions</strong> and <strong>model robustness</strong>.</p>
            {groups.map((g) => (
              <div key={g} className="mt-6">
                <h3 className="font-heading text-lg font-semibold">{GROUP_LABELS[g]}</h3>
                <div className="card mt-2 overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-grey-100"><tr className="border-b border-border"><th className="h-9 w-14 px-3 text-left font-heading text-xs font-semibold uppercase text-grey-800">Test</th><th className="h-9 px-3 text-left font-heading text-xs font-semibold uppercase text-grey-800">Name</th><th className="h-9 px-3 text-left font-heading text-xs font-semibold uppercase text-grey-800">Data</th><th className="h-9 w-20 px-3 text-right font-heading text-xs font-semibold uppercase text-grey-800">Weight</th></tr></thead>
                    <tbody>
                      {TEST_CASES.filter((t) => t.group === g).map((t) => (
                        <tr key={t.key} className="border-b border-border last:border-0"><td className="px-3 py-2 tabular text-grey-600">{t.test}</td><td className="px-3 py-2 font-medium text-ink">{t.label}</td><td className="px-3 py-2 text-grey-800">{t.description}</td><td className="px-3 py-2 text-right tabular">{t.weight}</td></tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
            <Alert variant="info" className="mt-6" title="Padding">The evaluator prepends one hour of data (the first sample held constant) to every cycle so recurrent models and filters can settle. The padded hour is excluded from the error metrics.</Alert>
          </section>

          <section id="metrics">
            <H2 id="metrics">Metrics &amp; weighted score</H2>
            <p className="mt-3">For every blinded cycle the evaluator reports <strong>RMSE</strong>, <strong>MAE</strong> and <strong>maximum error</strong> (all in % SOC), and returns the predicted and actual SOC time series. Each test case above is the mean RMSE over its cycles.</p>
            <MathBlock className="mt-4" tex={String.raw`\mathrm{RMSE}_c = 100\sqrt{\frac{1}{N}\sum_{k=1}^{N}\big(\mathrm{SOC}_k - \widehat{\mathrm{SOC}}_k\big)^2}, \qquad E_{\text{weighted}} = \sum_{j=1}^{18} w_j\,\overline{\mathrm{RMSE}}_j, \quad \sum_j w_j = 1`} />
            <p className="mt-3">The leaderboard ranks by <strong>weighted error</strong>: the weighted sum of the test-case values using the weights in the tables above. Weights are equal per test <em>type</em> (0.1 each), split evenly where a type has several cases (loads, temperatures), and test 1 is weighted 0 because every other test is a subset of it. Weights sum to 1, so the score is itself a percentage-point SOC error.</p>
            <p className="mt-3">Two further columns appear on the leaderboard: <strong>Max error</strong> (worst instantaneous error anywhere) and a <strong>Complexity</strong> classification from 1 (trivial) to 10 (extreme, ±1) reflecting the computational cost of the model in the evaluator.</p>
          </section>

          <section id="submission-format">
            <H2 id="submission-format">Submission format</H2>
            <p className="mt-3">A submission is a single <strong>.zip</strong> file with everything at the top level — no sub-folders. It must contain the estimator; author, affiliation and model name come from your account and the submission form:</p>
            <ul className="mt-3 list-disc space-y-2 pl-6">
              <li><code className="rounded bg-grey-100 px-1">Model.m</code>, <code className="rounded bg-grey-100 px-1">Model.p</code> or <code className="rounded bg-grey-100 px-1">Model.py</code> — the estimator function, named exactly <code className="rounded bg-grey-100 px-1">Model</code>. Use p-code if you need to protect MATLAB source. Python models get the same <code className="rounded bg-grey-100 px-1">Model(X, z)</code> contract (return <code className="rounded bg-grey-100 px-1">(Y_est, z)</code>) and run in an environment with <strong>numpy and scipy only</strong> — ship trained weights as arrays and implement inference with numpy.</li>
              <li>Any other files the model needs (parameter <code className="rounded bg-grey-100 px-1">.mat</code> files, lookup tables). Toolboxes are <em>not</em> available — implement network layers and filters yourself.</li>
            </ul>
            <h3 className="mt-6 font-heading text-lg font-semibold">Function signature</h3>
            <ModelLoopDiagram className="mt-3" />
            <p className="mt-4">The evaluator calls the model once per sample at 1 Hz, mimicking a BMS:</p>
            <CodeBlock code={LOOP} filename="evaluator loop (pseudo-code)" className="mt-3" />
            <ul className="mt-3 list-disc space-y-2 pl-6">
              <li><code className="rounded bg-grey-100 px-1">X</code> is a 1×3 row: <strong>Current [A]</strong> (negative = discharge, positive = charge), <strong>Voltage [V]</strong>, <strong>Battery temperature [°C]</strong>.</li>
              <li><code className="rounded bg-grey-100 px-1">Y</code> is the 1×1 SOC estimate on <strong>0 … 1</strong>.</li>
              <li><code className="rounded bg-grey-100 px-1">z</code> is free-form memory returned to you on the next call: filter states, hidden states, input history, parameters. Detect the first call with <code className="rounded bg-grey-100 px-1">nargin &lt; 2</code> and initialise there. Avoid <code className="rounded bg-grey-100 px-1">load()</code> inside the loop.</li>
            </ul>
            <h3 className="mt-6 font-heading text-lg font-semibold">Minimal example</h3>
            <CodeBlock code={CC_EXAMPLE} filename="Model.m" className="mt-3" />
            <p className="mt-3">Complete EKF, FNN and LSTM packages — including how to unpack trained network weights into a step function — are walked through on the <Link href="/examples">Examples page</Link> with schematics and annotated source.</p>
          </section>

          <section id="test-tool">
            <H2 id="test-tool">Testing before you submit</H2>
            <p className="mt-3">You don&apos;t need MATLAB or any local tool. On the <Link href="/submit">Submit</Link> page, <strong>Test your package first</strong> runs your zip through the production evaluator on one <em>public</em> drive cycle (m80, REORDERED1 at 25 °C, first two hours of the open data): the same +0.3 A validation pass, then the cycle with the standard one-hour padding. Within a minute or so you see whether the package loads and runs, the error message if it doesn&apos;t, its RMSE on that cycle, and its complexity bin.</p>
            <p className="mt-3">A test run never touches the blinded data, is not scored, does not appear on any leaderboard and does not count against contest limits. It is rate-limited to five per hour per account. Structural checks (archive layout, file names, function signature) also run instantly on every upload.</p>
          </section>

          <section id="evaluation">
            <H2 id="evaluation">How evaluation runs</H2>
            <ol className="mt-3 list-decimal space-y-2 pl-6">
              <li>Your package is stored and a job is queued. The queue is processed in order by the evaluation worker.</li>
              <li>The model is loaded and iterated over every blinded cycle for all four cells at all six temperatures, then over the charging profiles and the robustness variants (initial SOC of 90 / 60 / 30 %; current offsets of ±0.1 A and ±0.3 A).</li>
              <li>Per-cycle errors, test-case averages, the weighted score and down-sampled time series are written to your submission page; you receive an email.</li>
              <li>The uploaded package is <strong>deleted</strong> as soon as the evaluation finishes. Source is never displayed on the site.</li>
            </ol>
            <p className="mt-3">If a model throws, returns NaN, or exceeds the runtime budget, the submission is marked failed with the evaluator&apos;s message and can be re-queued after you fix it.</p>
          </section>

          <section id="citation">
            <H2 id="citation">Citation</H2>
            <p className="mt-3">Please cite both the paper and the dataset when you publish results from the tool:</p>
            <blockquote className="mt-3 border-l-4 border-gold pl-4 text-sm">P. J. Kollmeyer, M. Naguib, F. Khanum and A. Emadi, “A Blind Modeling Tool for Standardized Evaluation of Battery State of Charge Estimation Algorithms,” <em>2022 IEEE Transportation Electrification Conference &amp; Expo (ITEC)</em>, pp. 243–248, 2022, doi: <a href="https://doi.org/10.1109/ITEC53557.2022.9813996">10.1109/ITEC53557.2022.9813996</a>.</blockquote>
            <blockquote className="mt-3 border-l-4 border-gold pl-4 text-sm">P. J. Kollmeyer, F. Khanum, M. Naguib and A. Emadi, “Tesla Model 3 2170 Li-ion Cell Dataset and Battery SOC Estimation Blind Modeling Tool,” Borealis, V2, doi: <a href="https://doi.org/10.5683/SP3/ZVTR4B">10.5683/SP3/ZVTR4B</a>.</blockquote>
          </section>
        </article>
      </div>
    </>
  );
}
