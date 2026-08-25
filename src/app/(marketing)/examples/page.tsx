import type { Metadata } from "next";
import Link from "next/link";
import { Download, CheckCircle2, XCircle, FileArchive } from "lucide-react";
import { PageHeader } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CodeBlock } from "@/components/code-block";
import { ModelSchematic } from "@/components/model-schematic";
import { EXAMPLES } from "@/lib/examples";
import { MODEL_TYPE_LABELS, COMPLEXITY_LABELS } from "@/lib/test-cases";

export const metadata: Metadata = { title: "Example models" };

const DOI = "https://doi.org/10.5683/SP3/ZVTR4B";

export default function ExamplesPage() {
  return (
    <>
      <PageHeader
        eyebrow="Reference implementations"
        title="Example models"
        description="The four complete submission packages shipped with the dataset, from a 20-line Coulomb counter to an LSTM stepped by hand. Each one is shown three ways — a standardized schematic, the package contents, and the annotated source — so you can copy the pattern that matches your method."
        actions={<Button asChild><a href={DOI} target="_blank" rel="noreferrer"><Download /> Download the packages</a></Button>}
      />
      <div className="container-site py-8">
        <Tabs defaultValue={EXAMPLES[0].slug}>
          <TabsList>
            {EXAMPLES.map((e) => <TabsTrigger key={e.slug} value={e.slug}>{e.name.replace(/^Example \d — /, "")}</TabsTrigger>)}
          </TabsList>
          {EXAMPLES.map((e) => (
            <TabsContent key={e.slug} value={e.slug} className="space-y-6">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="max-w-3xl">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="font-heading text-2xl font-bold">{e.name}</h2>
                    <Badge variant="maroon">{MODEL_TYPE_LABELS[e.modelType]}</Badge>
                    <Badge>Complexity {e.complexity} · {COMPLEXITY_LABELS[e.complexity]}</Badge>
                  </div>
                  <p className="mt-1 font-heading text-[15px] text-grey-700">{e.tagline}</p>
                  {e.description.map((p, i) => <p key={i} className="mt-3 text-[15px] leading-relaxed text-grey-800">{p}</p>)}
                </div>
                <div className="card w-full shrink-0 p-4 text-sm lg:w-72">
                  <p className="flex items-center gap-2 font-heading font-semibold text-ink"><FileArchive className="size-4 text-maroon" /> Package contents</p>
                  <ul className="mt-2 divide-y divide-border">
                    {e.files.map((fl) => <li key={fl.name} className="py-1.5"><code className="text-xs text-ink">{fl.name}</code><span className="block text-xs text-grey-600">{fl.note}</span></li>)}
                  </ul>
                  <p className="mt-2 text-xs text-grey-600">Zip these at the top level — no folder inside the archive.</p>
                </div>
              </div>

              <ModelSchematic spec={e.spec} />

              <div className="grid gap-4 md:grid-cols-2">
                <div className="card p-4">
                  <p className="flex items-center gap-2 font-heading text-sm font-semibold text-ink"><CheckCircle2 className="size-4 text-forest" /> Where it shines</p>
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-grey-800">{e.strengths.map((s) => <li key={s}>{s}</li>)}</ul>
                </div>
                <div className="card p-4">
                  <p className="flex items-center gap-2 font-heading text-sm font-semibold text-ink"><XCircle className="size-4 text-danger" /> Where it struggles</p>
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-grey-800">{e.weaknesses.map((s) => <li key={s}>{s}</li>)}</ul>
                </div>
              </div>

              <div>
                <div className="mb-2 flex items-baseline justify-between gap-3">
                  <h3 className="font-heading text-lg font-semibold">Model.m</h3>
                  {e.codeNote ? <p className="text-xs text-grey-600">{e.codeNote}</p> : null}
                </div>
                <CodeBlock code={e.code} filename="Model.m" collapsible maxLines={36} />
              </div>
            </TabsContent>
          ))}
        </Tabs>

        <div className="mt-10 rounded-brand border-l-4 border-gold bg-gold-100 p-5 text-sm text-grey-800">
          <p className="font-heading font-semibold text-ink">Adapting an example</p>
          <ol className="mt-2 list-decimal space-y-1 pl-5">
            <li>Keep the signature <code className="rounded bg-white px-1">[Y, z] = Model(X, z)</code> and the <code className="rounded bg-white px-1">nargin &lt; 2</code> initialisation block.</li>
            <li>Put every parameter your model needs either inline or in a <code className="rounded bg-white px-1">.mat</code> loaded once at initialisation — never in the per-sample path.</li>
            <li>Return SOC on 0–1 and store <em>all</em> memory in <code className="rounded bg-white px-1">z</code>; the evaluator keeps nothing else between calls.</li>
            <li>Use <Link href="/docs#test-tool" className="text-maroon underline">Test your package first</Link> on the Submit page, then <Link href="/submit" className="text-maroon underline">submit</Link>.</li>
          </ol>
        </div>
      </div>
    </>
  );
}
