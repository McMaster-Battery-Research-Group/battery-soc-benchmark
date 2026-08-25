import Link from "next/link";
import { db } from "@/lib/db";
import { Stat } from "@/components/ui/misc";
import { StatusBadge } from "@/components/ui/badge";
import { fmtDateTime } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function AdminHome() {
  const [users, unverified, subs, queued, running, failed, open, messages, recent] = await Promise.all([
    db.user.count(),
    db.user.count({ where: { emailVerified: null } }),
    db.submission.count(),
    db.submission.count({ where: { status: "QUEUED" } }),
    db.submission.count({ where: { status: "RUNNING" } }),
    db.submission.count({ where: { status: "FAILED" } }),
    db.contest.count({ where: { status: "OPEN" } }),
    db.contactMessage.count({ where: { resolved: false } }),
    db.submission.findMany({ take: 8, orderBy: { submittedAt: "desc" }, include: { user: { select: { name: true } } } }),
  ]);
  return (
    <div>
      <h1 className="font-heading text-2xl font-bold">Overview</h1>
      <div className="mt-5 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Users" value={users} sub={`${unverified} unverified`} />
        <Stat label="Submissions" value={subs} sub={`${queued} queued · ${running} running`} />
        <Stat label="Failed evaluations" value={failed} sub={<Link href="/admin/submissions?status=FAILED" className="text-maroon underline">Review</Link>} />
        <Stat label="Open items" value={open + messages} sub={`${open} open contest · ${messages} unread messages`} />
      </div>
      <h2 className="mt-8 font-heading text-lg font-semibold">Recent submissions</h2>
      <ul className="card mt-3 divide-y divide-border">
        {recent.map((s) => (
          <li key={s.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
            <div><Link href={`/submissions/${s.id}`} className="font-heading font-medium text-ink hover:text-maroon">{s.modelName}</Link><span className="text-grey-600"> · {s.user.name} · {fmtDateTime(s.submittedAt)}</span></div>
            <StatusBadge status={s.status} />
          </li>
        ))}
      </ul>
      <div className="card mt-8 p-5 text-sm text-grey-800">
        <p className="font-heading font-semibold text-ink">Evaluation worker</p>
        <p className="mt-1">Jobs are processed by the worker process (<code className="rounded bg-grey-100 px-1">npm run worker</code>). Evaluator: <strong>{process.env.EVALUATOR ?? "mock"}</strong>. {queued + running > 0 ? `${queued + running} job(s) pending.` : "Queue is empty."}</p>
      </div>
    </div>
  );
}
