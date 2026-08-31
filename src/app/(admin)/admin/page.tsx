import Link from "next/link";
import { db } from "@/lib/db";
import { Stat } from "@/components/ui/misc";
import { StatusBadge } from "@/components/ui/badge";
import { fmtDateTime } from "@/lib/utils";
import { RelTime } from "@/components/rel-time";

export const dynamic = "force-dynamic";

export default async function AdminHome() {
  const [users, unverified, subs, queued, running, failed, open, messages, recent, activity] = await Promise.all([
    db.user.count(),
    db.user.count({ where: { emailVerified: null } }),
    db.submission.count(),
    db.submission.count({ where: { status: "QUEUED" } }),
    db.submission.count({ where: { status: "RUNNING" } }),
    db.submission.count({ where: { status: "FAILED" } }),
    db.contest.count({ where: { status: "OPEN" } }),
    db.contactMessage.count({ where: { resolved: false } }),
    db.submission.findMany({ take: 8, orderBy: { submittedAt: "desc" }, include: { user: { select: { name: true } } } }),
    db.adminEvent.findMany({ take: 20, orderBy: { createdAt: "desc" } }),
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
      <h2 className="mt-8 font-heading text-lg font-semibold">Activity</h2>
      <p className="mt-1 text-sm text-grey-700">The events administrators are e-mailed about, kept here regardless of anyone&apos;s e-mail toggles. Contact-form messages live under <Link href="/admin/messages" className="text-maroon underline">Messages</Link>.</p>
      {activity.length === 0 ? (
        <p className="mt-3 text-sm text-grey-600">Nothing yet — new accounts, verifications, role changes, deletions and scoring changes will appear here.</p>
      ) : (
        <ul className="card mt-3 divide-y divide-border">
          {activity.map((e) => (
            <li key={e.id} className="flex items-start gap-3 px-4 py-2.5 text-sm">
              <span className="mt-0.5 shrink-0 rounded-[3px] bg-grey-100 px-1.5 py-0.5 font-heading text-[10px] font-semibold uppercase tracking-wide text-grey-700">{e.kind}</span>
              <span className="min-w-0 flex-1 text-grey-800">{e.text}</span>
              <span className="shrink-0 text-xs text-grey-600"><RelTime date={e.createdAt} absolute={fmtDateTime(e.createdAt)} /></span>
            </li>
          ))}
        </ul>
      )}
      <div className="card mt-8 p-5 text-sm text-grey-800">
        <p className="font-heading font-semibold text-ink">Evaluation worker</p>
        <p className="mt-1">Jobs are processed by the worker process (<code className="rounded bg-grey-100 px-1">npm run worker</code>). Evaluator: <strong>{process.env.EVALUATOR ?? "mock"}</strong>. {queued + running > 0 ? `${queued + running} job(s) pending.` : "Queue is empty."}</p>
      </div>
    </div>
  );
}
