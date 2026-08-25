import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { ContestForm } from "./contest-form";
import { Alert } from "@/components/ui/misc";
import { toCsv } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function AdminContestEdit({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ saved?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const isNew = id === "new";
  const contest = isNew ? null : await db.contest.findUnique({ where: { id }, include: { entries: { include: { user: { select: { name: true, email: true, affiliation: true } } } } } });
  if (!isNew && !contest) notFound();
  const entriesCsv = contest ? toCsv(contest.entries.map((e) => ({ name: e.user.name, email: e.user.email, affiliation: e.user.affiliation, team: e.teamName ?? "", registered: e.acceptedTerms.toISOString() })), [
    { key: "name", header: "Name" }, { key: "email", header: "Email" }, { key: "affiliation", header: "Affiliation" }, { key: "team", header: "Team" }, { key: "registered", header: "Registered at" },
  ]) : "";
  return (
    <div>
      <h1 className="font-heading text-2xl font-bold">{isNew ? "New contest" : `Edit: ${contest!.title}`}</h1>
      {sp.saved ? <Alert variant="success" className="mt-4">Contest saved.</Alert> : null}
      <ContestForm
        contest={contest ? { ...contest, startsAt: contest.startsAt.toISOString().slice(0, 16), endsAt: contest.endsAt.toISOString().slice(0, 16) } : null}
        entriesCsv={entriesCsv}
        entryCount={contest?.entries.length ?? 0}
      />
    </div>
  );
}
