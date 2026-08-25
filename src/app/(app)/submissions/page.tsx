import type { Metadata } from "next";
import Link from "next/link";
import { FolderKanban, Lock, Trophy } from "lucide-react";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { MODEL_TYPE_LABELS } from "@/lib/test-cases";
import { fmtPct, fmtDateTime } from "@/lib/utils";
import { PageHeader, EmptyState } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { StatusBadge, Badge } from "@/components/ui/badge";

export const metadata: Metadata = { title: "My submissions" };
export const dynamic = "force-dynamic";

export default async function MySubmissionsPage() {
  const session = await auth();
  const subs = await db.submission.findMany({
    where: { userId: session!.user.id },
    orderBy: { submittedAt: "desc" },
    include: { result: { select: { weightedError: true, allCells: true, tempM20: true, complexity: true } }, contest: { select: { title: true, slug: true } } },
  });
  const active = subs.filter((s) => s.status === "QUEUED" || s.status === "RUNNING").length;

  return (
    <>
      <PageHeader eyebrow="Your workspace" title="My submissions" description={`${subs.length} submission${subs.length === 1 ? "" : "s"}${active ? ` · ${active} in progress` : ""}. Private models are listed here but hidden from the public leaderboard.`} actions={<Button asChild><Link href="/submit">Submit a model</Link></Button>} />
      <div className="container-site py-10">
        {subs.length === 0 ? (
          <EmptyState icon={FolderKanban} title="No submissions yet" description="Package your estimator as a .zip and submit it for blinded evaluation. Results typically arrive within minutes." action={<Button asChild><Link href="/submit">Submit your first model</Link></Button>} />
        ) : (
          <div className="card overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-grey-100">
                <tr className="border-b border-border">
                  {["Model", "Status", "Submitted", "Weighted", "All cells", "−20 °C", ""].map((h, i) => (
                    <th key={h || "actions"} className={`h-10 px-3 font-heading text-xs font-semibold uppercase tracking-wide text-grey-800 ${i >= 3 && i <= 5 ? "text-right" : "text-left"} ${i === 5 ? "hidden md:table-cell" : ""} ${i === 2 ? "hidden sm:table-cell" : ""}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {subs.map((s) => (
                  <tr key={s.id} className="border-b border-border hover:bg-maroon-100/40">
                    <td className="px-3 py-3">
                      <Link href={`/submissions/${s.id}`} className="font-heading font-semibold text-ink hover:text-maroon hover:underline">{s.modelName}</Link>
                      <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-grey-600">
                        <span>#{s.seq} · {MODEL_TYPE_LABELS[s.modelType]}</span>
                        {s.isPrivate ? <Badge variant="neutral"><Lock className="size-3" /> Private</Badge> : null}
                        {s.contest ? <Badge variant="gold"><Trophy className="size-3" /> {s.contest.title}</Badge> : null}
                      </div>
                    </td>
                    <td className="px-3 py-3"><StatusBadge status={s.status} /></td>
                    <td className="hidden whitespace-nowrap px-3 py-3 text-grey-700 sm:table-cell">{fmtDateTime(s.submittedAt)}</td>
                    <td className="px-3 py-3 text-right font-heading font-semibold text-ink tabular">{s.result ? fmtPct(s.result.weightedError) : "—"}</td>
                    <td className="px-3 py-3 text-right tabular">{s.result ? fmtPct(s.result.allCells) : "—"}</td>
                    <td className="hidden px-3 py-3 text-right tabular md:table-cell">{s.result ? fmtPct(s.result.tempM20) : "—"}</td>
                    <td className="px-3 py-3 text-right"><Button asChild variant="tertiary" size="sm"><Link href={`/submissions/${s.id}`}>View →</Link></Button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
