import Link from "next/link";
import { Copy, Plus, Trophy } from "lucide-react";
import { db } from "@/lib/db";
import { fmtDate } from "@/lib/utils";
import { StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { contestPhase, PHASE_BADGE } from "@/lib/contest";
import { duplicateContestAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function AdminContests() {
  const contests = await db.contest.findMany({ orderBy: { startsAt: "desc" }, include: { _count: { select: { entries: true, submissions: true } } } });
  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <h1 className="font-heading text-2xl font-bold">Contests</h1>
        <Button asChild><Link href="/admin/contests/new"><Plus /> New contest</Link></Button>
      </div>
      <ul className="card mt-4 divide-y divide-border">
        {contests.map((c) => {
          const phase = contestPhase(c);
          return (
            <li key={c.id} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <Link href={`/admin/contests/${c.id}`} className="font-heading font-semibold text-ink hover:text-maroon">{c.title}</Link>
                <p className="text-sm text-grey-700">/contest/{c.slug} · {fmtDate(c.startsAt)} – {fmtDate(c.endsAt)} · {c._count.entries} registered · {c._count.submissions} entries</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge status={PHASE_BADGE[phase]} />
                {phase === "judging" ? <Button asChild size="sm"><Link href={`/admin/contests/${c.id}/results`}><Trophy /> Finalize results</Link></Button> : null}
                <form action={duplicateContestAction.bind(null, c.id)}><Button type="submit" variant="outline" size="sm"><Copy /> Duplicate</Button></form>
                <Button asChild variant="tertiary" size="sm"><Link href={`/contest/${c.slug}`}>View →</Link></Button>
              </div>
            </li>
          );
        })}
        {contests.length === 0 ? <li className="p-6 text-center text-sm text-grey-600">No contests yet.</li> : null}
      </ul>
    </div>
  );
}
