import { db } from "@/lib/db";
import { TEST_CASES, METRIC_KEYS } from "@/lib/test-cases";
import { getActiveScoring, DEFAULT_WEIGHTS, normalise } from "@/lib/scoring-config";
import { fmtDateTime } from "@/lib/utils";
import { Alert } from "@/components/ui/misc";
import { WeightsEditor } from "./weights-editor";

export const dynamic = "force-dynamic";

export default async function AdminScoring() {
  const active = await getActiveScoring(true);
  const history = await db.scoringConfig.findMany({ orderBy: { createdAt: "desc" }, take: 20 });
  const users = history.length ? await db.user.findMany({ where: { id: { in: history.map((h) => h.createdBy).filter((x): x is string => !!x) } }, select: { id: true, name: true } }) : [];
  const nameOf = (id: string | null) => users.find((u) => u.id === id)?.name ?? id ?? "—";

  return (
    <div>
      <h1 className="font-heading text-2xl font-bold">Scoring weights</h1>
      <p className="mt-1 max-w-3xl text-sm text-grey-700">
        The headline <strong>weighted error</strong> is Σ weight × RMSE over the test cases below. Changing the weights recomputes every stored score from the unchanged per-test results (no model is re-run), records a score-history entry on each affected submission, and — if you tick the box — e-mails the authors a fresh PDF with your explanation. The per-test metrics themselves (RMSE per cycle, robustness sweeps, complexity) are computed by the evaluator and cannot be changed here; changing <em>those</em> is a new benchmark version (see README → <em>What happens if we change the grading?</em>).
      </p>

      <Alert variant={active.isDefault ? "info" : "warning"} className="mt-4" title={active.isDefault ? "Default weights are active (Blind Modeling Tool V2)" : "Custom weights are active"}>
        {active.updatedAt ? <>Last changed {fmtDateTime(active.updatedAt)} by {nameOf(active.updatedBy)}{active.note ? <> — “{active.note}”</> : null}.</> : <>No changes have been made since launch.</>}
      </Alert>

      <WeightsEditor
        rows={TEST_CASES.map((t) => ({ key: t.key, test: t.test, label: t.label, description: t.description, current: active.weights[t.key], defaultWeight: DEFAULT_WEIGHTS[t.key] }))}
        isDefault={active.isDefault}
      />

      <h2 className="mt-8 font-heading text-lg font-semibold">Change log</h2>
      {history.length === 0 ? (
        <p className="mt-2 text-sm text-grey-700">No changes yet.</p>
      ) : (
        <div className="card mt-3 overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-grey-100 text-left font-heading text-xs uppercase tracking-wide text-grey-700"><tr><th className="px-3 py-2">When</th><th className="px-3 py-2">By</th><th className="px-3 py-2">Note</th><th className="px-3 py-2">Weights (non-default only)</th><th className="px-3 py-2 text-right">Re-scored</th></tr></thead>
            <tbody>
              {history.map((h) => {
                const w = normalise(h.weights as Record<string, number>);
                const diff = METRIC_KEYS.filter((k) => Math.abs(w[k] - DEFAULT_WEIGHTS[k]) > 1e-9);
                return (
                  <tr key={h.id} className="border-t border-border align-top">
                    <td className="whitespace-nowrap px-3 py-2 text-grey-700">{fmtDateTime(h.createdAt)}</td>
                    <td className="px-3 py-2">{nameOf(h.createdBy)}</td>
                    <td className="px-3 py-2 text-grey-800">{h.note}</td>
                    <td className="px-3 py-2 text-xs text-grey-700">{diff.length ? diff.map((k) => `${TEST_CASES.find((t) => t.key === k)!.short}: ${w[k].toFixed(4)}`).join(" · ") : "defaults"}</td>
                    <td className="px-3 py-2 text-right tabular">{h.rescored}{h.notified ? ` · ${h.notified} e-mails` : ""}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
