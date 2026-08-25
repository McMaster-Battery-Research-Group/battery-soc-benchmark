import type { Metadata } from "next";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/ui/misc";
import { SubmitForm } from "./submit-form";
import { DryRunPanel } from "./dry-run-panel";
import { FileArchive, FileCode2, FileBox, ShieldCheck } from "lucide-react";

export const metadata: Metadata = { title: "Submit a model" };
export const dynamic = "force-dynamic";

export default async function SubmitPage({ searchParams }: { searchParams: Promise<{ contest?: string }> }) {
  const sp = await searchParams;
  const session = await auth();
  const now = new Date();
  const contests = session?.user
    ? await db.contest.findMany({
        where: { status: "OPEN", startsAt: { lte: now }, endsAt: { gte: now }, entries: { some: { userId: session.user.id } } },
        select: { id: true, title: true, slug: true, endsAt: true, maxSubmissionsPerUser: true, _count: { select: { submissions: { where: { userId: session.user.id, status: { not: "FAILED" } } } } } },
      })
    : [];

  return (
    <>
      <PageHeader eyebrow="Blinded evaluation" title="Submit a model" description="Upload your submission package. It is checked for structure immediately, queued for evaluation on the blinded dataset, and deleted as soon as the evaluation finishes." />
      <div className="container-site grid gap-8 py-10 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <DryRunPanel directUpload={(process.env.STORAGE ?? "local") === "blob"} />
          <SubmitForm contests={contests.map((c) => ({ id: c.id, title: c.title, remaining: c.maxSubmissionsPerUser - c._count.submissions }))} preselectContest={sp.contest} maxMb={Number(process.env.MAX_UPLOAD_MB ?? 50)} directUpload={(process.env.STORAGE ?? "local") === "blob"} />
        </div>
        <aside className="space-y-4">
          <div className="card p-5">
            <p className="font-heading font-semibold text-ink">Package checklist</p>
            <ul className="mt-3 space-y-3 text-sm text-grey-800">
              <li className="flex gap-3"><FileArchive className="mt-0.5 size-4 shrink-0 text-maroon" /><span>A single <strong>.zip</strong> with files at the top level — no sub-folders.</span></li>
              <li className="flex gap-3"><FileCode2 className="mt-0.5 size-4 shrink-0 text-maroon" /><span><code className="rounded bg-grey-100 px-1">Model.m</code>, <code className="rounded bg-grey-100 px-1">Model.p</code> or <code className="rounded bg-grey-100 px-1">Model.py</code> defining <code className="rounded bg-grey-100 px-1">[Y, z] = Model(X, z)</code>. <code className="rounded bg-grey-100 px-1">X = [I, V, T]</code>, <code className="rounded bg-grey-100 px-1">Y</code> is SOC in 0–1.</span></li>
              <li className="flex gap-3"><FileBox className="mt-0.5 size-4 shrink-0 text-maroon" /><span>Any parameter files the model loads (<code className="rounded bg-grey-100 px-1">.mat</code>, <code className="rounded bg-grey-100 px-1">.npz</code>, …). Your name, affiliation and model name come from your account and this form.</span></li>
              <li className="flex gap-3"><ShieldCheck className="mt-0.5 size-4 shrink-0 text-maroon" /><span>Use <strong>Test your package first</strong> above — it runs your model on a public cycle through the real evaluator and catches format and runtime errors before you spend a submission.</span></li>
            </ul>
            <Link href="/docs#submission-format" className="mt-4 inline-block text-sm font-medium text-maroon underline">Full submission format guide →</Link>
          </div>
          <div className="card p-5 text-sm text-grey-800">
            <p className="font-heading font-semibold text-ink">What happens to your file</p>
            <p className="mt-2">Your package is stored only until the evaluator has run. Source code is never shown to other users or administrators through the site. Submit a <code className="rounded bg-grey-100 px-1">Model.p</code> (p-code) if you need to protect proprietary implementations.</p>
          </div>
        </aside>
      </div>
    </>
  );
}
