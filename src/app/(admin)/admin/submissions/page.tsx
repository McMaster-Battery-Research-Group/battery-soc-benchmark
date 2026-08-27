import Link from "next/link";
import { db } from "@/lib/db";
import { fmtDateTime, fmtPct } from "@/lib/utils";
import { StatusBadge, Badge } from "@/components/ui/badge";
import { NativeSelect } from "@/components/ui/input";
import { CURRENT_EVALUATOR_VERSION, isCurrentBenchmark } from "@/lib/benchmark-version";
import { ModerateButtons } from "./moderate";

export const dynamic = "force-dynamic";

export default async function AdminSubmissions({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const { status } = await searchParams;
  const subs = await db.submission.findMany({
    where: status ? { status: status as "QUEUED" | "RUNNING" | "COMPLETED" | "FAILED" } : {},
    orderBy: { submittedAt: "desc" },
    take: 200,
    include: { user: { select: { name: true, email: true } }, result: { select: { weightedError: true, evaluatorVersion: true } }, contest: { select: { title: true } }, _count: { select: { collaborators: true } } },
  });
  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-bold">Submissions</h1>
          <p className="mt-1 text-sm text-grey-700">{subs.length} shown{status ? ` · ${status}` : ""}. Moderation actions ask for a reason and e-mail the author and accepted collaborators.</p>
        </div>
        <form className="flex items-center gap-2 text-sm">
          <label htmlFor="status" className="text-grey-700">Status</label>
          <NativeSelect id="status" name="status" defaultValue={status ?? ""} className="h-9 w-40 text-sm">
            <option value="">All</option><option>QUEUED</option><option>RUNNING</option><option>COMPLETED</option><option>FAILED</option>
          </NativeSelect>
          <button className="rounded-brand border border-border px-3 py-1.5 font-heading text-sm font-medium hover:bg-grey-100">Filter</button>
        </form>
      </div>
      {/* The card scrolls horizontally on narrow screens; the sticky first columns keep the model identifiable. */}
      <div className="card mt-4 max-w-full overflow-x-auto">
        <table className="w-full min-w-[1040px] text-sm">
          <thead className="bg-grey-100">
            <tr className="border-b border-border">
              {["#", "Model", "User", "Status", "Weighted", "Submitted", "Visibility", "Actions"].map((h) => (
                <th key={h} className="h-10 whitespace-nowrap px-3 text-left font-heading text-xs font-semibold uppercase tracking-wide text-grey-800">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {subs.map((s) => {
              const legacy = s.result && !isCurrentBenchmark(s.result.evaluatorVersion);
              return (
                <tr key={s.id} className="border-b border-border align-top">
                  <td className="px-3 py-2.5 tabular text-grey-600">{s.seq}</td>
                  <td className="max-w-[320px] px-3 py-2.5">
                    <Link href={`/submissions/${s.id}`} className="font-heading font-medium text-ink hover:text-maroon">{s.modelName}</Link>
                    <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-grey-600">
                      {s.contest ? <Badge variant="gold">{s.contest.title}</Badge> : null}
                      {s._count.collaborators ? <span>+{s._count.collaborators} co-author{s._count.collaborators > 1 ? "s" : ""}</span> : null}
                      {legacy ? <Badge variant="warning" title={`Evaluated with ${s.result!.evaluatorVersion}; current is ${CURRENT_EVALUATOR_VERSION}`}>legacy scoring</Badge> : null}
                    </div>
                    {s.failureMessage ? <p className="mt-0.5 line-clamp-2 text-xs text-danger" title={s.failureMessage}>{s.failureMessage}</p> : null}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5"><div>{s.user.name}</div><div className="text-xs text-grey-600">{s.user.email}</div></td>
                  <td className="px-3 py-2.5"><StatusBadge status={s.status} /></td>
                  <td className="px-3 py-2.5 tabular">{s.result ? fmtPct(s.result.weightedError) : "—"}</td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-grey-700">{fmtDateTime(s.submittedAt)}</td>
                  <td className="whitespace-nowrap px-3 py-2.5">
                    <div className="flex flex-wrap gap-1">
                      {s.isHidden ? <Badge variant="danger">Hidden</Badge> : s.isPrivate ? <Badge>Private</Badge> : <Badge variant="success">Public</Badge>}
                    </div>
                  </td>
                  <td className="px-3 py-2.5"><ModerateButtons id={s.id} isPrivate={s.isPrivate} isHidden={s.isHidden} status={s.status} compact /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
