import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import ReactMarkdown from "react-markdown";
import { Trophy, CalendarDays, Users, CheckCircle2, ListChecks } from "lucide-react";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { getLeaderboardRows } from "@/lib/queries";
import { fmtDate, fmtDateTime } from "@/lib/utils";
import { StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LeaderboardTable } from "@/components/leaderboard/leaderboard-table";
import { Alert } from "@/components/ui/misc";
import { Countdown } from "./countdown";
import { RegisterButton } from "./register-button";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const c = await db.contest.findUnique({ where: { slug: (await params).slug } });
  return { title: c?.title ?? "Contest" };
}

export default async function ContestPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const session = await auth();
  const contest = await db.contest.findUnique({ where: { slug }, include: { _count: { select: { entries: true, submissions: true } } } });
  if (!contest || (contest.status === "DRAFT" && session?.user?.role !== "ADMIN")) notFound();
  const entry = session?.user ? await db.contestEntry.findUnique({ where: { contestId_userId: { contestId: contest.id, userId: session.user.id } } }) : null;
  const rows = await getLeaderboardRows({ contestId: contest.id, viewerId: session?.user?.id, isAdmin: session?.user?.role === "ADMIN" });
  // Frozen leaderboard: after the deadline only submissions made before endsAt count.
  const frozen = rows.filter((r) => new Date(r.submittedAt) <= contest.endsAt);
  const now = new Date();
  const isLive = contest.status === "OPEN" && contest.startsAt <= now && contest.endsAt >= now;
  const mine = session?.user ? frozen.filter((r) => r.userId === session.user.id).length : 0;

  return (
    <>
      <div className="bg-maroon text-white">
        <div className="container-site grid gap-8 py-12 md:grid-cols-3 md:py-16">
          <div className="md:col-span-2">
            <div className="flex flex-wrap items-center gap-2"><span className="font-heading text-xs font-semibold uppercase tracking-[0.14em] text-gold">Contest</span><StatusBadge status={contest.status} /></div>
            <h1 className="mt-3 font-heading text-4xl font-bold leading-tight text-white md:text-5xl">{contest.title}</h1>
            <p className="mt-4 max-w-2xl text-lg leading-relaxed text-white/90">{contest.summary}</p>
            <dl className="mt-6 flex flex-wrap gap-x-8 gap-y-3 text-sm text-white/85">
              <div className="flex items-center gap-2"><CalendarDays className="size-4 text-gold" /> {fmtDate(contest.startsAt)} → {fmtDate(contest.endsAt)}</div>
              <div className="flex items-center gap-2"><Users className="size-4 text-gold" /> {contest._count.entries} registered · {frozen.length} scored entries</div>
              <div className="flex items-center gap-2"><ListChecks className="size-4 text-gold" /> up to {contest.maxSubmissionsPerUser} submissions each</div>
            </dl>
            <div className="mt-8 flex flex-wrap gap-3">
              {isLive ? (
                entry ? (
                  <>
                    <Button asChild variant="gold" size="lg"><Link href={`/submit?contest=${contest.id}`}>Submit an entry ({contest.maxSubmissionsPerUser - mine} left)</Link></Button>
                    <span className="inline-flex items-center gap-2 text-sm text-white/90"><CheckCircle2 className="size-4 text-gold" /> You are registered{entry.teamName ? ` as ${entry.teamName}` : ""}</span>
                  </>
                ) : (
                  <RegisterButton contestId={contest.id} signedIn={!!session?.user} />
                )
              ) : (
                <Button asChild variant="gold" size="lg"><Link href="#leaderboard">View final standings</Link></Button>
              )}
            </div>
          </div>
          <div className="rounded-brand border border-white/20 bg-white/10 p-6 backdrop-blur">
            <Trophy className="size-8 text-gold" />
            <p className="mt-3 font-heading text-xs font-semibold uppercase tracking-wide text-gold">Prizes</p>
            <p className="mt-1 font-heading text-xl font-semibold leading-snug">{contest.prizeText}</p>
            <div className="mt-5 border-t border-white/20 pt-5">
              <p className="font-heading text-xs font-semibold uppercase tracking-wide text-gold">{isLive ? "Deadline in" : contest.status === "OPEN" ? "Opens in" : "Closed"}</p>
              <Countdown target={(contest.status === "OPEN" && contest.startsAt > now ? contest.startsAt : contest.endsAt).toISOString()} />
              <p className="mt-1 text-xs text-white/75">{fmtDateTime(contest.endsAt)} (server time)</p>
            </div>
          </div>
        </div>
      </div>

      <div className="container-site py-8">
        {contest.status === "DRAFT" ? <Alert variant="warning" className="mb-6" title="Draft contest">Only administrators can see this page. Set the status to Open to publish it.</Alert> : null}
        <Tabs defaultValue="leaderboard">
          <TabsList>
            <TabsTrigger value="leaderboard">Leaderboard</TabsTrigger>
            <TabsTrigger value="about">About</TabsTrigger>
            <TabsTrigger value="rules">Rules & eligibility</TabsTrigger>
          </TabsList>
          <TabsContent value="leaderboard">
            <div id="leaderboard" className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-grey-700">{isLive ? "Live standings — ranking is by weighted error and freezes at the deadline." : `Final standings, frozen at ${fmtDateTime(contest.endsAt)}.`} Ties break on all-cells RMSE, then earlier submission.</p>
            </div>
            <LeaderboardTable rows={frozen} viewerId={session?.user?.id} compact title={contest.slug} />
          </TabsContent>
          <TabsContent value="about"><article className="md max-w-3xl"><ReactMarkdown>{contest.description}</ReactMarkdown></article></TabsContent>
          <TabsContent value="rules"><article className="md max-w-3xl"><ReactMarkdown>{contest.rules}</ReactMarkdown></article></TabsContent>
        </Tabs>
      </div>
    </>
  );
}
