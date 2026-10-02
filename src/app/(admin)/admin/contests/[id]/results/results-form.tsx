"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Trophy } from "lucide-react";
import { finalizeContestAction, reopenContestResultsAction } from "../../../actions";
import { Label, NativeSelect, Textarea, Hint } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toast";
import { fmtDateTime } from "@/lib/utils";

type Entry = { id: string; userId: string | null; modelName: string; author: string; weightedError: number; allCells: number; submittedAt: string };

export function ResultsForm({ contestId, judged, registrants, places, entries, initialPicks, initialNote }: {
  contestId: string; judged: boolean; registrants: number; places: { label: string; amount: string }[]; entries: Entry[]; initialPicks: string[]; initialNote: string;
}) {
  const router = useRouter();
  const { push } = useToast();
  const [picks, setPicks] = React.useState<string[]>(places.map((_, i) => initialPicks[i] ?? ""));
  const [note, setNote] = React.useState(initialNote);
  const [notify, setNotify] = React.useState(!judged);
  const [error, setError] = React.useState("");
  const [pending, start] = React.useTransition();
  const byId = new Map(entries.map((e) => [e.id, e]));
  const picked = new Set(picks);
  const sameEntrant = picks.some((p, i) => p && picks.some((q, j) => j !== i && q && byId.get(q)?.userId && byId.get(q)?.userId === byId.get(p)?.userId));

  if (!entries.length) return <Alert variant="warning" className="mt-4">No scored, on-time entries. There is nothing to award.</Alert>;

  return (
    <div className="mt-4 grid gap-6 lg:grid-cols-[1fr_1.2fr]">
      <div className="card space-y-4 p-6">
        <h2 className="flex items-center gap-2 font-heading text-lg font-semibold"><Trophy className="size-5 text-maroon" /> Winners</h2>
        {places.map((p, i) => (
          <div key={i}>
            <Label htmlFor={`pick-${i}`}>{p.label}{p.amount ? ` · ${p.amount}` : ""}</Label>
            <NativeSelect id={`pick-${i}`} value={picks[i]} onChange={(e) => { const v = e.currentTarget.value; setPicks((ps) => ps.map((x, j) => (j === i ? v : x))); }}>
              <option value="">Choose an entry…</option>
              {entries.map((e, rank) => (
                <option key={e.id} value={e.id} disabled={picked.has(e.id) && picks[i] !== e.id}>#{rank + 1} {e.modelName} ({e.author}) {e.weightedError.toFixed(3)} %</option>
              ))}
            </NativeSelect>
          </div>
        ))}
        {sameEntrant ? <Alert variant="warning">Two places go to the same entrant. That is allowed, but the rules usually award each entrant once.</Alert> : null}
        <div>
          <Label htmlFor="note">Note shown above the winners (optional, Markdown)</Label>
          <Textarea id="note" rows={3} value={note} onChange={(e) => setNote(e.currentTarget.value)} placeholder="e.g. Prizes will be presented at ITEC 2027." />
        </div>
        <label className="flex items-start gap-2 text-sm text-grey-800">
          <input type="checkbox" className="mt-0.5 size-4 accent-[#7a003c]" checked={notify} onChange={(e) => setNotify(e.currentTarget.checked)} />
          <span>E-mail the results to all {registrants} registrant{registrants === 1 ? "" : "s"}{judged ? " again" : ""}</span>
        </label>
        {error ? <Alert variant="danger">{error}</Alert> : null}
        <div className="flex flex-wrap gap-2 border-t border-border pt-4">
          <Button loading={pending} onClick={() => {
            if (!window.confirm(`${judged ? "Update" : "Finalize"} the results${notify ? ` and e-mail ${registrants} registrant${registrants === 1 ? "" : "s"}` : ""}? The winners appear on the public contest page.`)) return;
            setError("");
            start(async () => {
              const r = await finalizeContestAction(contestId, picks, note, notify);
              if (!r.ok) { setError(r.error); return; }
              push({ kind: "success", title: judged ? "Results updated" : "Results finalized", description: notify ? `${r.emailed} e-mail${r.emailed === 1 ? "" : "s"} sent.` : undefined });
              router.refresh();
            });
          }}>{judged ? "Update results" : "Finalize results"}</Button>
          {judged ? (
            <Button variant="outline" disabled={pending} onClick={() => {
              if (!window.confirm("Reopen judging? The winners are removed from the public page until you finalize again.")) return;
              start(async () => { await reopenContestResultsAction(contestId); router.refresh(); });
            }}>Reopen judging</Button>
          ) : null}
        </div>
        <Hint>The model, author and score of each winner are stored as they are now, so later renames or rescoring do not change the published result.</Hint>
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-grey-100 text-left text-xs uppercase tracking-wide text-grey-700">
            <tr><th className="px-3 py-2">Rank</th><th className="px-3 py-2">Entry</th><th className="px-3 py-2 text-right">Weighted</th><th className="px-3 py-2 text-right">All cells</th><th className="px-3 py-2">Submitted</th></tr>
          </thead>
          <tbody className="divide-y divide-border">
            {entries.map((e, i) => (
              <tr key={e.id} className={picked.has(e.id) ? "bg-gold/15" : undefined}>
                <td className="px-3 py-2 tabular">{i + 1}</td>
                <td className="px-3 py-2"><a href={`/submissions/${e.id}`} target="_blank" className="font-semibold text-ink hover:text-maroon">{e.modelName}</a><span className="block text-xs text-grey-600">{e.author}</span></td>
                <td className="px-3 py-2 text-right tabular">{e.weightedError.toFixed(3)}</td>
                <td className="px-3 py-2 text-right tabular">{e.allCells.toFixed(3)}</td>
                <td className="px-3 py-2 text-xs text-grey-700">{fmtDateTime(e.submittedAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
