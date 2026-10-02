import Link from "next/link";
import { notFound } from "next/navigation";
import { Trophy } from "lucide-react";
import { db } from "@/lib/db";
import { ContestForm } from "./contest-form";
import { Alert } from "@/components/ui/misc";
import { StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toCsv } from "@/lib/utils";
import { contestPhase, PHASE_BADGE, prizesOf, zonedInputValue } from "@/lib/contest";

export const dynamic = "force-dynamic";

export default async function AdminContestEdit({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ saved?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const isNew = id === "new";
  const contest = isNew ? null : await db.contest.findUnique({ where: { id }, include: { entries: { include: { user: { select: { name: true, email: true, affiliation: true } } } } } });
  if (!isNew && !contest) notFound();
  const entriesCsv = contest
    ? toCsv(
        contest.entries.map((e) => ({ name: e.user.name, email: e.user.email, affiliation: e.user.affiliation, team: e.teamName ?? "", members: e.teamMembers.join("; "), eligible: e.eligibilityConfirmed ? "yes" : "", registered: e.acceptedTerms.toISOString() })),
        [
          { key: "name", header: "Name" }, { key: "email", header: "Email" }, { key: "affiliation", header: "Affiliation" }, { key: "team", header: "Team" },
          { key: "members", header: "Other team members" }, { key: "eligible", header: "Confirmed eligibility" }, { key: "registered", header: "Registered at" },
        ],
      )
    : "";
  const phase = contest ? contestPhase(contest) : null;
  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="font-heading text-2xl font-bold">{isNew ? "New contest" : contest!.title}</h1>
        {phase ? <StatusBadge status={PHASE_BADGE[phase]} /> : null}
        {phase === "judging" || phase === "judged" ? (
          <Button asChild size="sm" className="ml-auto"><Link href={`/admin/contests/${id}/results`}><Trophy /> {phase === "judged" ? "Results" : "Finalize results"}</Link></Button>
        ) : null}
      </div>
      {sp.saved === "published" ? <Alert variant="success" className="mt-4">Saved. The contest is published and follows its dates.</Alert> : sp.saved ? <Alert variant="success" className="mt-4">Saved as a draft. Only administrators can see it.</Alert> : null}
      <ContestForm
        key={contest?.updatedAt.toISOString() ?? "new"}
        contest={
          contest
            ? {
                id: contest.id, title: contest.title, slug: contest.slug, summary: contest.summary, description: contest.description, rules: contest.rules,
                startsAt: zonedInputValue(contest.startsAt), endsAt: zonedInputValue(contest.endsAt), registrationEndsAt: contest.registrationEndsAt ? zonedInputValue(contest.registrationEndsAt) : "",
                maxSubmissionsPerUser: contest.maxSubmissionsPerUser, maxTeamSize: contest.maxTeamSize, eligibility: contest.eligibility, eligibilityNote: contest.eligibilityNote ?? "",
                allowedRuntimes: contest.allowedRuntimes, prizes: prizesOf(contest), status: contest.status,
              }
            : null
        }
        entriesCsv={entriesCsv}
        entryCount={contest?.entries.length ?? 0}
      />
    </div>
  );
}
