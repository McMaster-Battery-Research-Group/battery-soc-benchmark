"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Save, Timer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label, Hint } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { saveEvalSettingsAction } from "../actions";

/** Policy knobs stored in the DB; workers re-read them within ~15 s, no restart or SSH needed. */
export function EvalSettingsCard({ initial, updatedNote }: { initial: { evalTimeoutMin: number; dryRunTimeoutMin: number; submissionsPerDay: number }; updatedNote: string | null }) {
  const router = useRouter();
  const { push } = useToast();
  const [v, setV] = React.useState(initial);
  const [pending, start] = React.useTransition();
  const dirty = JSON.stringify(v) !== JSON.stringify(initial);
  const save = () =>
    start(async () => {
      const res = await saveEvalSettingsAction(v);
      if (!res.ok) return push({ kind: "error", title: "Not saved", description: res.error });
      push({ kind: "success", title: "Evaluation settings saved", description: "Workers pick this up within ~15 seconds — no restart needed." });
      router.refresh();
    });
  const num = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement>) => setV({ ...v, [k]: Number(e.target.value) });
  return (
    <section className="card mt-8 p-5">
      <h2 className="flex items-center gap-2 font-heading text-lg font-semibold text-ink"><Timer className="size-5 text-maroon" /> Evaluation settings</h2>
      <p className="mt-1 text-sm text-grey-700">Policy limits, applied by every worker within ~15 seconds{updatedNote ? ` · last changed ${updatedNote}` : " · using defaults"}. Machine tuning (CPU, memory, concurrency) stays in each worker&apos;s environment file.</p>
      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        <div>
          <Label htmlFor="es-eval">Evaluation limit (min)</Label>
          <Input id="es-eval" type="number" min={10} max={1440} value={v.evalTimeoutMin} onChange={num("evalTimeoutMin")} />
          <Hint>Hard kill per blinded evaluation. Stated to users as “{Math.round(v.evalTimeoutMin / 60 * 10) / 10} h” on the Submit page.</Hint>
        </div>
        <div>
          <Label htmlFor="es-dry">Test-run limit (min)</Label>
          <Input id="es-dry" type="number" min={2} max={60} value={v.dryRunTimeoutMin} onChange={num("dryRunTimeoutMin")} />
          <Hint>Per “Test your package” run.</Hint>
        </div>
        <div>
          <Label htmlFor="es-cap">Submissions / day / user</Label>
          <Input id="es-cap" type="number" min={1} max={100} value={v.submissionsPerDay} onChange={num("submissionsPerDay")} />
          <Hint>Rolling 24 h; administrators are exempt.</Hint>
        </div>
      </div>
      <div className="mt-4">
        <Button onClick={save} loading={pending} disabled={!dirty}><Save /> Save settings</Button>
      </div>
    </section>
  );
}
