import type { Metadata } from "next";
import Link from "next/link";
import { Download, CheckCircle2, XCircle } from "lucide-react";
import { PageHeader } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ExampleCode } from "./example-code";
import { ModelSchematic } from "@/components/model-schematic";
import { EXAMPLES } from "@/lib/examples";
import { auth } from "@/lib/auth";
import { MODEL_TYPE_LABELS, COMPLEXITY_LABELS } from "@/lib/test-cases";

export const metadata: Metadata = { title: "Example models" };

const DOI = "https://doi.org/10.5683/SP3/ZVTR4B";

export const dynamic = "force-dynamic";

export default async function ExamplesPage() {
  const session = await auth();
  return (
    <>
      <PageHeader
        eyebrow="Reference implementations"
        title="Example models"
        description="Four reference estimators — a coulomb counter, an EKF, a feedforward network and an LSTM — each as a MATLAB and a Python package. Read the schematic and the annotated source, download the package, or run it on a public drive cycle with one click to see what a result looks like."
        actions={<Button asChild variant="secondary"><a href={DOI} target="_blank" rel="noreferrer"><Download /> Original packages on Borealis</a></Button>}
      />
      <div className="container-site py-10">
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

              <ExampleCode
                slug={e.slug}
                modelName={e.name.replace(/^Example \d — /, "")}
                signedIn={!!session?.user}
                matlab={{ code: e.code, files: e.files, note: e.codeNote }}
                python={{ code: e.codePy, files: e.filesPy, note: e.codePyNote }}
              />
            </TabsContent>
          ))}
        </Tabs>

        <div className="mt-10 rounded-brand border-l-4 border-gold bg-gold-100 p-5 text-sm text-grey-800">
          <p className="font-heading font-semibold text-ink">Adapting an example</p>
          <ol className="mt-2 list-decimal space-y-1 pl-5">
            <li>Keep the signature — MATLAB <code className="rounded bg-white px-1">[Y, z] = Model(X, z)</code> with a <code className="rounded bg-white px-1">nargin &lt; 2</code> initialisation block, or Python <code className="rounded bg-white px-1">def Model(X, z=None)</code> returning <code className="rounded bg-white px-1">(Y, z)</code>.</li>
            <li>Put every parameter your model needs either inline or in a <code className="rounded bg-white px-1">.mat</code> loaded once at initialisation — never in the per-sample path.</li>
            <li>Return SOC on 0–1 and store <em>all</em> memory in <code className="rounded bg-white px-1">z</code>; the evaluator keeps nothing else between calls.</li>
            <li>Use <Link href="/docs#test-tool" className="text-maroon underline">Test your package first</Link> on the Submit page, then <Link href="/submit" className="text-maroon underline">submit</Link>.</li>
          </ol>
        </div>
      </div>
    </>
  );
}
