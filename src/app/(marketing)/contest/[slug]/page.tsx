import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import ReactMarkdown from "react-markdown";
import { Trophy, CalendarDays, Users, CheckCircle2, ListChecks, UserCheck, Cpu, Medal } from "lucide-react";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { getLeaderboardRows } from "@/lib/queries";
import { fmtDate, fmtDateTime } from "@/lib/utils";
import { contestPhase, ELIGIBILITY, PHASE_BADGE, prizesOf, registrationOpen, winnersOf } from "@/lib/contest";
import { StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LeaderboardTable } from "@/components/leaderboard/leaderboard-table";
import { Alert } from "@/components/ui/misc";
import { Countdown } from "./countdown";
import { RegisterButton } from "./register-button";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const c = await db.contest.findUnique({ where: { slug: (await params).slug }, select: { title: true, status: true } });
  // drafts 404 for the public, so their title must not leak through the page metadata either
  return { title: c && c.status !== "DRAFT" ? c.title : "Contest" };
}

export default async function ContestPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const session = await auth();
  const isAdmin = session?.user?.role === "ADMIN";
  const contest = await db.contest.findUnique({ where: { slug }, include: { _count: { select: { entries: true, submissions: true } } } });
  if (!contest || (contest.status === "DRAFT" && !isAdmin)) notFound();
  const entry = session?.user ? await db.contestEntry.findUnique({ where: { contestId_userId: { contestId: contest.id, userId: session.user.id } } }) : null;
  const rows = await getLeaderboardRows({ contestId: contest.id, viewerId: session?.user?.id, isAdmin });
  // Frozen leaderboard: after the deadline only submissions made before endsAt count.
  const frozen = rows.filter((r) => new Date(r.submittedAt) <= contest.endsAt);
  const phase = contestPhase(contest);
  const canRegister = registrationOpen(contest);
  const mine = session?.user ? frozen.filter((r) => r.ownerId === session.user.id).length : 0;
  const prizes = prizesOf(contest);
  const winners = phase === "judged" ? winnersOf(contest) : [];
  const elig = ELIGIBILITY[contest.eligibility] ?? ELIGIBILITY.ANYONE;
  const register = (
    <RegisterButton contestId={contest.id} slug={contest.slug} signedIn={!!session?.user} maxTeamSize={contest.maxTeamSize} eligibilityStatement={elig.statement} eligibilityNote={contest.eligibilityNote} />
  );
  const registered = entry ? (
    <span className="inline-flex items-center gap-2 text-sm text-white/90"><CheckCircle2 className="size-4 text-gold" /> You are registered{entry.teamName ? ` as ${entry.teamName}` : ""}</span>
  ) : null;

  return (
    <>
      <div className="bg-maroon text-white">
        <div className="container-site grid gap-8 py-12 md:grid-cols-3 md:py-16">
          <div className="md:col-span-2">
            <div className="flex flex-wrap items-center gap-2"><span className="font-heading text-xs font-semibold uppercase tracking-[0.14em] text-gold">Contest</span><StatusBadge status={PHASE_BADGE[phase]} /></div>
            <h1 className="mt-3 font-heading text-4xl font-bold leading-tight text-white md:text-5xl">{contest.title}</h1>
            <p className="mt-4 max-w-2xl text-lg leading-relaxed text-white/90">{contest.summary}</p>
            <dl className="mt-6 flex flex-wrap gap-x-8 gap-y-3 text-sm text-white/85">
              <div className="flex items-center gap-2"><CalendarDays className="size-4 text-gold" /> {fmtDate(contest.startsAt)} → {fmtDate(contest.endsAt)}</div>
              <div className="flex items-center gap-2"><Users className="size-4 text-gold" /> {contest._count.entries} registered · {frozen.length} scored entries</div>
              <div className="flex items-center gap-2"><ListChecks className="size-4 text-gold" /> up to {contest.maxSubmissionsPerUser} submissions{contest.maxTeamSize > 1 ? ` · teams of up to ${contest.maxTeamSize}` : ""}</div>
              <div className="flex items-center gap-2"><UserCheck className="size-4 text-gold" /> {elig.label}</div>
              {contest.allowedRuntimes.length ? <div className="flex items-center gap-2"><Cpu className="size-4 text-gold" /> {contest.allowedRuntimes.map((r) => (r === "matlab" ? "MATLAB" : "Python")).join(" or ")} only</div> : null}
            </dl>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              {phase === "open" ? (
                entry ? (
                  <>
                    <Button asChild variant="gold" size="lg"><Link href={`/submit?contest=${contest.id}`}>Submit an entry ({Math.max(0, contest.maxSubmissionsPerUser - mine)} left)</Link></Button>
                    {registered}
                  </>
                ) : canRegister ? register : <p className="text-sm text-white/85">Registration closed {fmtDateTime(contest.registrationEndsAt)}.</p>
              ) : phase === "upcoming" ? (
                entry ? <>{registered}<span className="text-sm text-white/75">Submissions open {fmtDateTime(contest.startsAt)}.</span></> : canRegister ? register : null
              ) : phase === "judged" ? (
                <Button asChild variant="gold" size="lg"><Link href="#winners">See the winners</Link></Button>
              ) : (
                <Button asChild variant="gold" size="lg"><Link href="#leaderboard">View final standings</Link></Button>
              )}
            </div>
            {canRegister && contest.registrationEndsAt && !entry ? <p className="mt-3 text-sm text-white/75">Registration closes {fmtDateTime(contest.registrationEndsAt)}.</p> : null}
          </div>
          <div className="rounded-brand border border-white/20 bg-white/10 p-6 backdrop-blur">
            <Trophy className="size-8 text-gold" />
            {prizes.length ? (
              <>
                <p className="mt-3 font-heading text-xs font-semibold uppercase tracking-wide text-gold">Prizes</p>
                <ul className="mt-2 space-y-1">
                  {prizes.map((p, i) => (
                    <li key={i} className="flex items-baseline justify-between gap-3"><span className="text-sm text-white/85">{p.label}</span><span className="font-heading text-lg font-semibold">{p.amount}</span></li>
                  ))}
                </ul>
              </>
            ) : null}
            <div className="mt-5 border-t border-white/20 pt-5">
              <p className="font-heading text-xs font-semibold uppercase tracking-wide text-gold">{phase === "open" ? "Deadline in" : phase === "upcoming" ? "Opens in" : phase === "judging" ? "Closed · results to come" : "Closed"}</p>
              {phase === "open" || phase === "upcoming" ? <Countdown target={(phase === "upcoming" ? contest.startsAt : contest.endsAt).toISOString()} /> : null}
              <p className="mt-1 text-xs text-white/75">Deadline {fmtDateTime(contest.endsAt)}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="container-site py-8">
        {phase === "draft" ? (
          <Alert variant="warning" className="mb-6" title="Draft contest">
            Only administrators can see this page. <Link href={`/admin/contests/${contest.id}`} className="font-semibold text-maroon underline">Edit or publish it</Link> in the admin panel.
          </Alert>
        ) : null}
        {winners.length ? (
          <section id="winners" className="mb-10 scroll-mt-24">
            <h2 className="font-heading text-2xl font-bold">Winners</h2>
            {contest.resultsNote ? <article className="md mt-2 max-w-3xl"><ReactMarkdown>{contest.resultsNote}</ReactMarkdown></article> : null}
            <ol className="mt-4 grid gap-4 md:grid-cols-3">
              {winners.map((w) => (
                <li key={w.place} className="card flex flex-col p-5">
                  <div className="flex items-center gap-2"><Medal className={w.place === 1 ? "size-6 text-gold" : "size-6 text-maroon"} /><span className="font-heading text-sm font-semibold uppercase tracking-wide text-maroon">{w.label}</span>{w.amount ? <span className="ml-auto font-heading font-semibold text-ink">{w.amount}</span> : null}</div>
                  <Link href={`/submissions/${w.submissionId}`} className="mt-3 font-heading text-lg font-semibold text-ink hover:text-maroon hover:underline">{w.modelName}</Link>
                  <p className="text-sm text-grey-700">{w.author}</p>
                  <p className="mt-2 text-sm text-grey-700">Weighted error <strong className="tabular text-ink">{w.weightedError.toFixed(2)} %</strong></p>
                </li>
              ))}
            </ol>
          </section>
        ) : null}
        <Tabs defaultValue="leaderboard">
          <TabsList>
            <TabsTrigger value="leaderboard">Leaderboard</TabsTrigger>
            <TabsTrigger value="about">About</TabsTrigger>
            <TabsTrigger value="rules">Rules & eligibility</TabsTrigger>
          </TabsList>
          <TabsContent value="leaderboard">
            <div id="leaderboard" className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-grey-700">{phase === "open" || phase === "upcoming" ? "Live standings: ranking is by weighted error and freezes at the deadline." : `Final standings, frozen at ${fmtDateTime(contest.endsAt)}.`} Ties break on all-cells RMSE, then earlier submission.</p>
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
