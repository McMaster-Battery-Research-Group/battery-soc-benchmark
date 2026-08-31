"use client";

import * as React from "react";
import type { TimeSeriesTrace } from "@/evaluator/types";
import { SocTrace } from "@/components/charts/soc-trace";
import { OffsetRmseChart } from "@/components/charts/offset-rmse";
import type { PerCycleRow } from "@/evaluator/types";
import { Alert } from "@/components/ui/misc";

const GROUPS: { id: NonNullable<TimeSeriesTrace["group"]>; title: string; blurb: string }[] = [
  { id: "cycle", title: "Selected drive cycles", blurb: "The thirteen cycles the original MATLAB tool plotted, one per test: blinded vs non-blinded cell (tests 1–3), drive vs charge (test 4), the three payloads on one cycle (tests 5–6), standard vs non-standard highway profiles (tests 7–8) and the temperature extremes (test 9)." },
  { id: "initialSoc", title: "Wrong initial SOC (test 10)", blurb: "Three cycles restarted with the estimator told the battery is at 90, 60 or 30 % while it is really full. Coulomb counting can never recover; voltage-informed estimators converge at a rate that is very visible here." },
  { id: "offset", title: "Current-sensor offset (test 11)", blurb: "Three cycles re-run with ±0.3 A added to the measured current. Integration-based estimators drift steadily; the plot shows whether and how fast the model corrects the bias." },
];

/** The cases that show how estimators differ (mirrors the plots the original MATLAB tool produced). */
export function KeyCases({ traces, modelName, robustness, perCycle }: { traces: TimeSeriesTrace[]; modelName: string; robustness?: { initialSocRmse: number[]; currentOffsetRmse: number[] } | null; perCycle?: PerCycleRow[] }) {
  const legacy = traces.every((t) => !t.group);
  return (
    <div className="space-y-8">
      {legacy ? (
        <Alert variant="info" title="Robustness-case traces were not recorded for this result">
          This submission was evaluated before the evaluator stored the initial-SOC and sensor-offset traces (2026-08-29). The drive-cycle traces below are complete; submit a new version to get the robustness plots as well.
        </Alert>
      ) : null}
      {GROUPS.map((g) => {
        const list = traces.filter((t) => (t.group ?? "cycle") === g.id);
        if (!list.length) return null;
        return (
          <section key={g.id}>
            <h3 className="font-heading text-lg font-semibold text-ink">{g.title}</h3>
            <p className="mb-3 mt-1 max-w-3xl text-sm text-grey-700">{g.blurb}</p>
            <KeyCasePicker traces={list} modelName={modelName} />
            {g.id === "offset" && robustness?.currentOffsetRmse?.length && perCycle ? (
              <div className="mt-4"><OffsetRmseChart currentOffsetRmse={robustness.currentOffsetRmse} perCycle={perCycle} /></div>
            ) : null}
          </section>
        );
      })}
    </div>
  );
}

function KeyCasePicker({ traces, modelName }: { traces: TimeSeriesTrace[]; modelName: string }) {
  const [key, setKey] = React.useState(traces[0]?.key ?? "");
  const options = traces.map((t) => ({ key: t.key, label: t.label }));
  const current = traces.find((t) => t.key === key) ?? traces[0];
  if (!current) return null;
  return (
    <div>
      <SocTrace traces={[current]} names={[modelName]} selectable options={options} onSelect={setKey} />
      {current.note ? <p className="mt-2 text-sm text-grey-700"><span className="font-heading font-medium text-ink">Why this case:</span> {current.note}</p> : null}
    </div>
  );
}
