import type { Metadata } from "next";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/ui/misc";
import { SubmitForm } from "./submit-form";
import { FileArchive, FileCode2, FileSpreadsheet, ShieldCheck } from "lucide-react";

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
      <div className="container-site grid gap-8 py-8 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <SubmitForm contests={contests.map((c) => ({ id: c.id, title: c.title, remaining: c.maxSubmissionsPerUser - c._count.submissions }))} preselectContest={sp.contest} maxMb={Number(process.env.MAX_UPLOAD_MB ?? 50)} directUpload={(process.env.STORAGE ?? "local") === "blob"} />
        </div>
        <aside className="space-y-4">
          <div className="card p-5">
            <p className="font-heading font-semibold text-ink">Package checklist</p>
            <ul className="mt-3 space-y-3 text-sm text-grey-800">
              <li className="flex gap-3"><FileArchive className="mt-0.5 size-4 shrink-0 text-maroon" /><span>A single <strong>.zip</strong> with files at the top level — no sub-folders.</span></li>
              <li className="flex gap-3"><FileCode2 className="mt-0.5 size-4 shrink-0 text-maroon" /><span><code className="rounded bg-grey-100 px-1">Model.m</code> or <code className="rounded bg-grey-100 px-1">Model.p</code> defining <code className="rounded bg-grey-100 px-1">[Y, z] = Model(X, z)</code>. <code className="rounded bg-grey-100 px-1">X = [I, V, T]</code>, <code className="rounded bg-grey-100 px-1">Y</code> is SOC in 0–1.</span></li>
              <li className="flex gap-3"><FileSpreadsheet className="mt-0.5 size-4 shrink-0 text-maroon" /><span><code className="rounded bg-grey-100 px-1">Settings.xlsx</code> with Author Name, Affiliation, Email and Model Name in B1–B4.</span></li>
              <li className="flex gap-3"><ShieldCheck className="mt-0.5 size-4 shrink-0 text-maroon" /><span>Run the <Link href="/docs#test-tool" className="text-maroon underline">Model Submission Test Tool</Link> locally first — it catches most errors before you upload.</span></li>
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
