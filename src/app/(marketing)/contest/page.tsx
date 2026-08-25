import type { Metadata } from "next";
import Link from "next/link";
import { Trophy, CalendarDays, Users } from "lucide-react";
import { db } from "@/lib/db";
import { fmtDate } from "@/lib/utils";
import { PageHeader, EmptyState } from "@/components/ui/misc";
import { ResultsNav } from "@/components/layout/results-nav";
import { StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Contests" };
export const dynamic = "force-dynamic";

export default async function ContestIndex() {
  const contests = await db.contest.findMany({ where: { status: { not: "DRAFT" } }, orderBy: { endsAt: "desc" }, include: { _count: { select: { entries: true, submissions: true } } } });
  const open = contests.filter((c) => c.status === "OPEN");
  const past = contests.filter((c) => c.status !== "OPEN");
  return (
    <>
      <ResultsNav />
      <PageHeader eyebrow="Competitions" title="SOC estimation contests" description="Time-boxed challenges with cash prizes, judged on a frozen snapshot of the blinded evaluation at the deadline. Register, submit up to the entry limit, and track your standing on the contest leaderboard." />
      <div className="container-site space-y-10 py-10">
        {open.length ? (
          <section>
            <h2 className="mb-4 font-heading text-xl font-bold">Open now</h2>
            {open.map((c) => (
              <div key={c.id} className="card overflow-hidden md:flex">
                <div className="bg-maroon p-6 text-white md:w-72 md:shrink-0">
                  <Trophy className="size-8 text-gold" />
                  <p className="mt-4 font-heading text-sm font-semibold uppercase tracking-wide text-gold">Prizes</p>
                  <p className="mt-1 font-heading text-lg font-semibold leading-snug">{c.prizeText}</p>
                </div>
                <div className="flex-1 p-6">
                  <div className="flex flex-wrap items-center gap-2"><h3 className="font-heading text-2xl font-bold">{c.title}</h3><StatusBadge status={c.status} /></div>
                  <p className="mt-2 text-grey-800">{c.summary}</p>
                  <dl className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-sm text-grey-700">
                    <div className="flex items-center gap-1.5"><CalendarDays className="size-4" /> {fmtDate(c.startsAt)} → <strong className="text-ink">{fmtDate(c.endsAt)}</strong></div>
                    <div className="flex items-center gap-1.5"><Users className="size-4" /> {c._count.entries} registered · {c._count.submissions} entries</div>
                  </dl>
                  <div className="mt-5 flex gap-2"><Button asChild><Link href={`/contest/${c.slug}`}>View contest & register</Link></Button></div>
                </div>
              </div>
            ))}
          </section>
        ) : (
          <EmptyState icon={Trophy} title="No contest is open right now" description="Announcements are posted here and on the McMaster Battery Lab site. The public leaderboard is always open for submissions." action={<Button asChild variant="secondary"><Link href="/leaderboard">Go to the leaderboard</Link></Button>} />
        )}
        {past.length ? (
          <section>
            <h2 className="mb-4 font-heading text-xl font-bold">Past contests</h2>
            <ul className="card divide-y divide-border">
              {past.map((c) => (
                <li key={c.id} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div><Link href={`/contest/${c.slug}`} className="font-heading font-semibold text-ink hover:text-maroon hover:underline">{c.title}</Link><p className="text-sm text-grey-700">{fmtDate(c.startsAt)} – {fmtDate(c.endsAt)} · {c._count.submissions} entries</p></div>
                  <StatusBadge status={c.status} />
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>
    </>
  );
}
