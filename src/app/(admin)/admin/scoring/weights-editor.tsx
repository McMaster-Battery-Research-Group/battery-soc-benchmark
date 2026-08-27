"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { RotateCcw, Save, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Textarea, Label, Hint } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import { saveScoringAction, previewScoringAction } from "../actions";

type Row = { key: string; test: number; label: string; description: string; current: number; defaultWeight: number };

export function WeightsEditor({ rows, isDefault }: { rows: Row[]; isDefault: boolean }) {
  const router = useRouter();
  const { push } = useToast();
  const [w, setW] = React.useState<Record<string, string>>(Object.fromEntries(rows.map((r) => [r.key, fmt(r.current)])));
  const [note, setNote] = React.useState("");
  const [notify, setNotify] = React.useState(true);
  const [preview, setPreview] = React.useState<{ changed: number; checked: number; sample: { seq: number; modelName: string; from: number; to: number }[] } | null>(null);
  const [confirm, setConfirm] = React.useState<"save" | "reset" | null>(null);
  const [pending, start] = React.useTransition();

  const nums = Object.fromEntries(rows.map((r) => [r.key, Number(w[r.key])])) as Record<string, number>;
  const sum = rows.reduce((s, r) => s + (Number.isFinite(nums[r.key]) ? nums[r.key] : 0), 0);
  const sumOk = Math.abs(sum - 1) <= 0.001;
  const dirty = rows.some((r) => Math.abs(nums[r.key] - r.current) > 1e-9);
  const allDefault = rows.every((r) => Math.abs(nums[r.key] - r.defaultWeight) < 1e-9);

  const doPreview = () =>
    start(async () => {
      const res = await previewScoringAction(nums);
      if (!res.ok) return push({ kind: "error", title: "Cannot preview", description: res.error });
      setPreview(res);
      setConfirm("save");
    });
  const doSave = (reset: boolean) =>
    start(async () => {
      const res = await saveScoringAction(reset ? null : nums, note, notify);
      setConfirm(null);
      if (!res.ok) return push({ kind: "error", title: "Not saved", description: res.error });
      push({ kind: "success", title: reset ? "Weights reset to defaults" : "Weights saved", description: `${res.rescored} submissions re-scored${res.emailed ? `, ${res.emailed} e-mails sent` : ""}.` });
      setNote("");
      router.refresh();
    });

  return (
    <div className="card mt-4 p-5">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[680px] text-sm">
          <thead className="text-left font-heading text-xs uppercase tracking-wide text-grey-700">
            <tr><th className="py-2 pr-3">Test</th><th className="py-2 pr-3">Name</th><th className="py-2 pr-3">Default</th><th className="py-2 pr-3">Weight</th></tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const changed = Math.abs(nums[r.key] - r.defaultWeight) > 1e-9;
              return (
                <tr key={r.key} className="border-t border-border">
                  <td className="py-2 pr-3 tabular text-grey-600">{r.test}</td>
                  <td className="py-2 pr-3"><div className="font-medium text-ink">{r.label}</div><div className="max-w-md text-xs text-grey-600">{r.description}</div></td>
                  <td className="py-2 pr-3 tabular text-grey-600">{fmt(r.defaultWeight)}</td>
                  <td className="py-2 pr-3">
                    <Input type="number" step="0.0001" min={0} max={1} value={w[r.key]} onChange={(e) => setW({ ...w, [r.key]: e.target.value })} className={`h-9 w-32 tabular ${changed ? "border-maroon" : ""}`} aria-label={`Weight for ${r.label}`} />
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t border-border font-heading font-semibold">
              <td colSpan={3} className="py-2 pr-3 text-right">Sum (must be 1.000)</td>
              <td className={`py-2 tabular ${sumOk ? "text-forest" : "text-danger"}`}>{sum.toFixed(4)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-[1fr_auto] md:items-end">
        <div>
          <Label htmlFor="sc-note" required>Reason for the change (sent to authors, kept in the change log)</Label>
          <Textarea id="sc-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Increased the −20 °C weight per the 2026 contest committee decision" />
          <Hint>At least 10 characters.</Hint>
          <label className="mt-2 flex items-center gap-2 text-sm text-grey-800"><Checkbox checked={notify} onCheckedChange={(v) => setNotify(!!v)} /> E-mail affected authors and accepted collaborators a fresh PDF with this reason</label>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setW(Object.fromEntries(rows.map((r) => [r.key, fmt(r.defaultWeight)])))} disabled={allDefault}><RotateCcw /> Fill defaults</Button>
          <Button onClick={doPreview} disabled={!dirty || !sumOk || note.trim().length < 10} loading={pending}><Save /> Preview & save</Button>
          {!isDefault ? <Button variant="danger" onClick={() => setConfirm("reset")} disabled={note.trim().length < 10}><RotateCcw /> Reset to defaults</Button> : null}
        </div>
      </div>

      <Dialog open={!!confirm} onOpenChange={(o) => !o && setConfirm(null)}>
        {confirm ? (
          <DialogContent title={confirm === "reset" ? "Reset weights to the V2 defaults?" : "Apply the new weights?"} description="Every stored score is recomputed from its unchanged per-test results. Each affected submission gets a score-history entry; nothing is re-run and nothing is deleted." size="md">
            {confirm === "save" && preview ? (
              <div className="text-sm">
                <p><strong>{preview.changed}</strong> of {preview.checked} scores would change{notify ? " — authors will be e-mailed" : " — authors will NOT be e-mailed"}.</p>
                {preview.sample.length ? (
                  <ul className="mt-2 max-h-48 overflow-auto rounded-brand border border-border text-xs">
                    {preview.sample.map((s) => <li key={s.seq} className="flex justify-between px-3 py-1 odd:bg-grey-100/60"><span>#{s.seq} {s.modelName}</span><span className="tabular">{s.from.toFixed(3)} → {s.to.toFixed(3)}</span></li>)}
                  </ul>
                ) : null}
              </div>
            ) : null}
            <DialogFooter>
              <DialogClose asChild><Button variant="outline">Cancel</Button></DialogClose>
              <Button variant={confirm === "reset" ? "danger" : "primary"} onClick={() => doSave(confirm === "reset")} loading={pending}><ShieldAlert /> {confirm === "reset" ? "Reset & re-score" : "Save & re-score"}</Button>
            </DialogFooter>
          </DialogContent>
        ) : null}
      </Dialog>
    </div>
  );
}

function fmt(n: number) {
  return (Math.round(n * 10000) / 10000).toString();
}
