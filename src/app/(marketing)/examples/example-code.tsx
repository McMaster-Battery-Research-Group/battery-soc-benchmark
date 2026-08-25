"use client";

import * as React from "react";
import { FileArchive } from "lucide-react";
import { CodeBlock } from "@/components/code-block";
import { cn } from "@/lib/utils";
import { Download } from "lucide-react";
import { RunExample } from "./run-example";

type Variant = { code: string; files: { name: string; note: string }[]; note?: string };

const STORAGE_KEY = "socbench.examples.runtime";

/** MATLAB / Python toggle for an example: package contents + annotated source. Remembers the choice. */
export function ExampleCode({ slug, modelName, signedIn, matlab, python }: { slug: string; modelName: string; signedIn: boolean; matlab: Variant; python: Variant }) {
  const [rt, setRt] = React.useState<"matlab" | "python">("matlab");
  React.useEffect(() => {
    try {
      const v = localStorage.getItem(STORAGE_KEY);
      if (v === "python" || v === "matlab") setRt(v);
    } catch {}
  }, []);
  const choose = (v: "matlab" | "python") => {
    setRt(v);
    try {
      localStorage.setItem(STORAGE_KEY, v);
    } catch {}
  };
  const v = rt === "matlab" ? matlab : python;
  const filename = rt === "matlab" ? "Model.m" : "Model.py";

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
      <div className="min-w-0">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
          <div className="inline-flex rounded-brand border border-border p-0.5" role="tablist" aria-label="Runtime">
            {(["matlab", "python"] as const).map((k) => (
              <button
                key={k}
                role="tab"
                aria-selected={rt === k}
                onClick={() => choose(k)}
                className={cn("rounded-[3px] px-3 py-1.5 font-heading text-sm font-medium transition-colors", rt === k ? "bg-maroon text-white" : "text-grey-800 hover:bg-grey-100")}
              >
                {k === "matlab" ? "MATLAB" : "Python"}
              </button>
            ))}
          </div>
          {v.note ? <p className="text-xs text-grey-600">{v.note}</p> : null}
        </div>
        <CodeBlock code={v.code} filename={filename} language={rt} collapsible maxLines={36} />
      </div>
      <aside className="card h-fit p-4 text-sm">
        <p className="flex items-center gap-2 font-heading font-semibold text-ink"><FileArchive className="size-4 text-maroon" /> Package contents</p>
        <ul className="mt-2 divide-y divide-border">
          {v.files.map((fl) => (
            <li key={fl.name} className="py-1.5">
              <code className="text-xs text-ink">{fl.name}</code>
              <span className="block text-xs text-grey-600">{fl.note}</span>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-xs text-grey-600">Zip these at the top level — no folder inside the archive.</p>
        <a href={`/examples/download/${slug}.${rt}.zip`} className="mt-3 inline-flex items-center gap-1.5 font-heading text-sm font-semibold text-maroon hover:underline"><Download className="size-4" /> Download {rt === "matlab" ? "MATLAB" : "Python"} package</a>
      </aside>
      <div className="lg:col-span-2">
        <RunExample slug={slug} runtime={rt} modelName={modelName} signedIn={signedIn} />
      </div>
    </div>
  );
}
