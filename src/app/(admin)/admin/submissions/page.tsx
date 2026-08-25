import Link from "next/link";
import { db } from "@/lib/db";
import { fmtDateTime, fmtPct } from "@/lib/utils";
import { StatusBadge, Badge } from "@/components/ui/badge";
import { HideToggle } from "./hide-toggle";
import { NativeSelect } from "@/components/ui/input";

export const dynamic = "force-dynamic";

export default async function AdminSubmissions({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const { status } = await searchParams;
  const subs = await db.submission.findMany({
    where: status ? { status: status as "QUEUED" | "RUNNING" | "COMPLETED" | "FAILED" } : {},
    orderBy: { submittedAt: "desc" },
    take: 200,
    include: { user: { select: { name: true, email: true } }, result: { select: { weightedError: true } }, contest: { select: { title: true } } },
  });
  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="font-heading text-2xl font-bold">Submissions</h1>
        <form className="flex items-center gap-2 text-sm">
          <label htmlFor="status" className="text-grey-700">Status</label>
          <NativeSelect id="status" name="status" defaultValue={status ?? ""} className="h-9 w-40 text-sm">
            <option value="">All</option><option>QUEUED</option><option>RUNNING</option><option>COMPLETED</option><option>FAILED</option>
          </NativeSelect>
          <button className="rounded-brand border border-border px-3 py-1.5 font-heading text-sm font-medium hover:bg-grey-100">Filter</button>
        </form>
      </div>
      <div className="card mt-4 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-grey-100"><tr className="border-b border-border">{["#", "Model", "User", "Status", "Weighted", "Submitted", "Visibility"].map((h) => <th key={h} className="h-10 px-3 text-left font-heading text-xs font-semibold uppercase tracking-wide text-grey-800">{h}</th>)}</tr></thead>
          <tbody>
            {subs.map((s) => (
              <tr key={s.id} className="border-b border-border">
                <td className="px-3 py-2 tabular text-grey-600">{s.seq}</td>
                <td className="px-3 py-2"><Link href={`/submissions/${s.id}`} className="font-heading font-medium text-ink hover:text-maroon">{s.modelName}</Link>{s.contest ? <Badge variant="gold" className="ml-2">{s.contest.title}</Badge> : null}{s.failureMessage ? <p className="mt-0.5 max-w-md truncate text-xs text-danger">{s.failureMessage}</p> : null}</td>
                <td className="px-3 py-2"><div>{s.user.name}</div><div className="text-xs text-grey-600">{s.user.email}</div></td>
                <td className="px-3 py-2"><StatusBadge status={s.status} /></td>
                <td className="px-3 py-2 tabular">{s.result ? fmtPct(s.result.weightedError) : "—"}</td>
                <td className="whitespace-nowrap px-3 py-2 text-grey-700">{fmtDateTime(s.submittedAt)}</td>
                <td className="px-3 py-2"><div className="flex items-center gap-2">{s.isPrivate ? <Badge>Private</Badge> : null}<HideToggle id={s.id} isHidden={s.isHidden} /></div></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
