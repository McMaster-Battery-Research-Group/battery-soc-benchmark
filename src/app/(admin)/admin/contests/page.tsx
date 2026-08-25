import Link from "next/link";
import { Plus } from "lucide-react";
import { db } from "@/lib/db";
import { fmtDate } from "@/lib/utils";
import { StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";

export default async function AdminContests() {
  const contests = await db.contest.findMany({ orderBy: { createdAt: "desc" }, include: { _count: { select: { entries: true, submissions: true } } } });
  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <h1 className="font-heading text-2xl font-bold">Contests</h1>
        <Button asChild><Link href="/admin/contests/new"><Plus /> New contest</Link></Button>
      </div>
      <ul className="card mt-4 divide-y divide-border">
        {contests.map((c) => (
          <li key={c.id} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <Link href={`/admin/contests/${c.id}`} className="font-heading font-semibold text-ink hover:text-maroon">{c.title}</Link>
              <p className="text-sm text-grey-700">/contest/{c.slug} · {fmtDate(c.startsAt)} – {fmtDate(c.endsAt)} · {c._count.entries} registered · {c._count.submissions} entries</p>
            </div>
            <div className="flex items-center gap-2"><StatusBadge status={c.status} /><Button asChild variant="tertiary" size="sm"><Link href={`/contest/${c.slug}`}>View →</Link></Button></div>
          </li>
        ))}
        {contests.length === 0 ? <li className="p-6 text-center text-sm text-grey-600">No contests yet.</li> : null}
      </ul>
    </div>
  );
}
