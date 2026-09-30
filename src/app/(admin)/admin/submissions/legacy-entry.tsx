"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Archive } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogClose, DialogTrigger } from "@/components/ui/dialog";
import { Input, Label, Hint, Textarea } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { createLegacyEntryAction } from "./credit-actions";

const MODEL_TYPES = [
  ["COULOMB_COUNTER", "Coulomb counter"],
  ["EKF", "Extended Kalman filter"],
  ["UKF", "Unscented Kalman filter"],
  ["FNN", "Feedforward neural network"],
  ["LSTM", "LSTM"],
  ["GRU", "GRU"],
  ["TRANSFORMER", "Transformer"],
  ["PHYSICS", "Physics-based"],
  ["HYBRID", "Hybrid"],
  ["OTHER", "Other"],
] as const;

/**
 * Records a score from before this platform existed — work evaluated with the original MATLAB
 * tool, for example. The entry appears on the leaderboard credited to its real author, badged so
 * it is never mistaken for a run of this evaluator, and cannot be re-evaluated because there is
 * no package to run.
 */
export function LegacyEntryDialog() {
  const router = useRouter();
  const { push } = useToast();
  const [open, setOpen] = React.useState(false);
  const [pending, start] = React.useTransition();
  const [f, setF] = React.useState({
    modelName: "",
    creditName: "",
    creditAffiliation: "",
    modelType: "OTHER",
    weightedError: "",
    allCells: "",
    maxError: "",
    source: "",
    submittedAt: "",
  });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setF((p) => ({ ...p, [k]: e.target.value }));

  const save = () =>
    start(async () => {
      const res = await createLegacyEntryAction({
        modelName: f.modelName,
        creditName: f.creditName,
        creditAffiliation: f.creditAffiliation,
        modelType: f.modelType,
        weightedError: Number(f.weightedError),
        allCells: f.allCells === "" ? null : Number(f.allCells),
        maxError: f.maxError === "" ? null : Number(f.maxError),
        source: f.source,
        submittedAt: f.submittedAt || undefined,
      });
      if (!res.ok) return push({ kind: "error", title: "Could not record the entry", description: res.error });
      push({ kind: "success", title: `Recorded as #${res.seq}` });
      setOpen(false);
      setF({ modelName: "", creditName: "", creditAffiliation: "", modelType: "OTHER", weightedError: "", allCells: "", maxError: "", source: "", submittedAt: "" });
      router.refresh();
    });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Archive /> Record a legacy score
        </Button>
      </DialogTrigger>
      <DialogContent title="Record a legacy score" description="Work evaluated before this platform existed" size="md">
        <p className="text-sm text-grey-700">
          Adds a leaderboard entry for a result produced elsewhere — the original MATLAB tool, for example. It is badged
          as carried over, has no package, and cannot be re-evaluated.
        </p>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <span className="sm:col-span-2">
            <Label htmlFor="le-name" required>Model name</Label>
            <Input id="le-name" value={f.modelName} onChange={set("modelName")} placeholder="LSTM, 2023 dataset" />
          </span>
          <span>
            <Label htmlFor="le-author" required>Credited to</Label>
            <Input id="le-author" value={f.creditName} onChange={set("creditName")} placeholder="Jane Smith" />
          </span>
          <span>
            <Label htmlFor="le-affil">Affiliation</Label>
            <Input id="le-affil" value={f.creditAffiliation} onChange={set("creditAffiliation")} placeholder="McMaster University" />
          </span>
          <span>
            <Label htmlFor="le-type">Model type</Label>
            <select id="le-type" value={f.modelType} onChange={set("modelType")} className="mt-1 h-10 w-full rounded-brand border border-border bg-white px-3 text-sm text-ink">
              {MODEL_TYPES.map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
          </span>
          <span>
            <Label htmlFor="le-date">Date of the original run</Label>
            <Input id="le-date" type="date" value={f.submittedAt} onChange={set("submittedAt")} />
          </span>
        </div>

        <h4 className="mt-5 font-heading text-xs font-semibold uppercase tracking-wide text-grey-600">Scores</h4>
        <Hint>Only the weighted error is required. Everything left blank shows as a dash on the leaderboard.</Hint>
        <div className="mt-1.5 grid gap-3 sm:grid-cols-3">
          <span>
            <Label htmlFor="le-we" required>Weighted error %</Label>
            <Input id="le-we" type="number" step="0.01" min="0" max="100" value={f.weightedError} onChange={set("weightedError")} placeholder="2.48" />
          </span>
          <span>
            <Label htmlFor="le-ac">All-cells RMSE %</Label>
            <Input id="le-ac" type="number" step="0.01" min="0" max="100" value={f.allCells} onChange={set("allCells")} />
          </span>
          <span>
            <Label htmlFor="le-me">Max error %</Label>
            <Input id="le-me" type="number" step="0.01" min="0" max="100" value={f.maxError} onChange={set("maxError")} />
          </span>
        </div>

        <span className="mt-4 block">
          <Label htmlFor="le-src" required>Where this score came from</Label>
          <Textarea id="le-src" rows={2} value={f.source} onChange={set("source")} placeholder="Evaluated with the original MATLAB Standardized Evaluation Tool, results in the ITEC 2022 paper." />
          <Hint>Shown on the entry, so anyone reading the leaderboard can judge how comparable it is.</Hint>
        </span>

        <DialogFooter>
          <DialogClose asChild><Button variant="secondary" disabled={pending}>Cancel</Button></DialogClose>
          <Button onClick={save} disabled={pending || !f.modelName.trim() || !f.creditName.trim() || !f.weightedError || !f.source.trim()}>
            <Archive /> Record the entry
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
