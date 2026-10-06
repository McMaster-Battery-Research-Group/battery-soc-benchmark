import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { getLeaderboardRows } from "@/lib/queries";
import { contestPhase, PHASE_BADGE, prizesOf, standings, winnersOf } from "@/lib/contest";
import { fmtDateTime } from "@/lib/utils";
import { StatusBadge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/misc";
import { ResultsForm } from "./results-form";

export const dynamic = "force-dynamic";

export default async function ContestResults({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const c = await db.contest.findUnique({ where: { id }, include: { _count: { select: { entries: true } } } });
  if (!c) notFound();
  const phase = contestPhase(c);
  const rows = await getLeaderboardRows({ contestId: c.id, isAdmin: true });
  const all = standings(rows, c.endsAt);
  const best = standings(rows, c.endsAt, true);
  const late = rows.filter((r) => new Date(r.submittedAt) > c.endsAt).length;
  const prizes = prizesOf(c);
  const places = Math.max(prizes.length, 1);
  const current = winnersOf(c);

  return (
    <div>
      <p className="text-sm"><Link href={`/admin/contests/${id}`} className="text-maroon hover:underline">← {c.title}</Link></p>
      <div className="mt-1 flex flex-wrap items-center gap-3">
        <h1 className="font-heading text-2xl font-bold">Results</h1>
        <StatusBadge status={PHASE_BADGE[phase]} />
      </div>
      {phase !== "judging" && phase !== "judged" ? (
        <Alert variant="info" className="mt-4">Results can be finalized after the deadline ({fmtDateTime(c.endsAt)}).</Alert>
      ) : (
        <>
          <p className="mt-2 max-w-3xl text-sm text-grey-700">
            Standings frozen at {fmtDateTime(c.endsAt)}: {all.length} scored entr{all.length === 1 ? "y" : "ies"} from {best.length} entrant{best.length === 1 ? "" : "s"}
            {late ? ` (${late} made after the deadline are ignored)` : ""}. The suggestion below is each entrant&apos;s best entry in rank order; change a pick if an entry is disqualified.
            {c.status === "JUDGED" && c.judgedAt ? ` Finalized ${fmtDateTime(c.judgedAt)}.` : ""}
          </p>
          <ResultsForm
            contestId={c.id}
            judged={c.status === "JUDGED"}
            registrants={c._count.entries}
            places={Array.from({ length: places }, (_, i) => ({ label: prizes[i]?.label ?? "Winner", amount: prizes[i]?.amount ?? "" }))}
            entries={all.map((r) => ({ id: r.id, userId: r.ownerId, modelName: r.modelName, author: r.author, weightedError: r.weightedError, allCells: r.allCells, submittedAt: r.submittedAt }))}
            initialPicks={current.length ? current.map((w) => w.submissionId) : best.slice(0, places).map((r) => r.id)}
            initialNote={c.resultsNote ?? ""}
          />
        </>
      )}
    </div>
  );
}
