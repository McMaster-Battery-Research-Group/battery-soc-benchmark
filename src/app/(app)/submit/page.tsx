import type { Metadata } from "next";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { getEvalSettings } from "@/lib/eval-settings";
import { PageHeader } from "@/components/ui/misc";
import { SubmitForm } from "./submit-form";
import { EvaluatorStatusLine } from "@/components/evaluator-status";
import { FileArchive, FileCode2, FileBox, ListChecks, Hourglass, Mail } from "lucide-react";

export const metadata: Metadata = { title: "Submit a model" };
export const dynamic = "force-dynamic";

export default async function SubmitPage({ searchParams }: { searchParams: Promise<{ contest?: string }> }) {
  const sp = await searchParams;
  const session = await auth();
  const settings = await getEvalSettings();
  const now = new Date();
  const contests = session?.user
    ? await db.contest.findMany({
        where: { status: { in: ["OPEN", "CLOSED"] }, startsAt: { lte: now }, endsAt: { gte: now }, entries: { some: { userId: session.user.id } } },
        select: { id: true, title: true, slug: true, endsAt: true, maxSubmissionsPerUser: true, _count: { select: { submissions: { where: { userId: session.user.id, status: { not: "FAILED" } } } } } },
      })
    : [];
  const hours = Math.round((settings.evalTimeoutMin / 60) * 10) / 10;

  return (
    <>
      <PageHeader eyebrow="Blinded evaluation" title="Submit a model" description="Upload your package, name the model, and it is queued for evaluation on the blinded dataset. The package is deleted as soon as the run finishes." />
      <div className="container-site grid gap-8 py-10 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <SubmitForm contests={contests.map((c) => ({ id: c.id, title: c.title, remaining: c.maxSubmissionsPerUser - c._count.submissions }))} preselectContest={sp.contest} maxMb={Number(process.env.MAX_UPLOAD_MB ?? 50)} directUpload={(process.env.STORAGE ?? "local") === "supabase"} isAdmin={session?.user?.role === "ADMIN"} />
        </div>
        <aside className="space-y-4">
          <div className="card p-5">
            <p className="font-heading font-semibold text-ink">What goes in the .zip</p>
            <ul className="mt-3 space-y-3 text-sm text-grey-800">
              <li className="flex gap-3"><FileArchive className="mt-0.5 size-4 shrink-0 text-maroon" /><span>Everything at the top level, no sub-folders.</span></li>
              <li className="flex gap-3"><FileCode2 className="mt-0.5 size-4 shrink-0 text-maroon" /><span><code className="rounded bg-grey-100 px-1">Model.m</code>, <code className="rounded bg-grey-100 px-1">Model.p</code> or <code className="rounded bg-grey-100 px-1">Model.py</code> defining <code className="rounded bg-grey-100 px-1">[Y, z] = Model(X, z)</code>, with <code className="rounded bg-grey-100 px-1">X = [I, V, T]</code> and <code className="rounded bg-grey-100 px-1">Y</code> the SOC in 0–1.</span></li>
              <li className="flex gap-3"><FileBox className="mt-0.5 size-4 shrink-0 text-maroon" /><span>Any parameter files the model loads (<code className="rounded bg-grey-100 px-1">.mat</code>, <code className="rounded bg-grey-100 px-1">.npz</code>, …).</span></li>
            </ul>
            <Link href="/docs#submission-format" className="mt-4 inline-block text-sm font-medium text-maroon underline">Submission format guide →</Link>
          </div>
          <div className="card p-5">
            <p className="font-heading font-semibold text-ink">What happens next</p>
            <ol className="mt-3 space-y-3 text-sm text-grey-800">
              <li className="flex gap-3"><ListChecks className="mt-0.5 size-4 shrink-0 text-maroon" /><span>The layout and file names are checked the moment you submit.</span></li>
              <li className="flex gap-3"><Hourglass className="mt-0.5 size-4 shrink-0 text-maroon" /><span>The model runs on the blinded data, in order of arrival, within a {hours}-hour limit. The reference models finish in minutes.</span></li>
              <li className="flex gap-3"><Mail className="mt-0.5 size-4 shrink-0 text-maroon" /><span>You get the results and PDF report by e-mail. Your source code is never shown to anyone; use <code className="rounded bg-grey-100 px-1">Model.p</code> to protect it further.</span></li>
            </ol>
          </div>
          <EvaluatorStatusLine className="rounded-brand border border-border bg-white px-4 py-3 text-sm" />
        </aside>
      </div>
    </>
  );
}
