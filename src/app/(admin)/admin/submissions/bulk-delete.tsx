"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Trash2, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { Textarea, Label, Hint } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { adminBulkDeleteAction } from "../actions";

/**
 * Row selection for the admin submissions table. The table itself is server-rendered; these three
 * client pieces share one context: a checkbox per row, a select-all in the header, and a floating
 * action bar that appears once something is selected.
 */
const Ctx = React.createContext<{ sel: Set<string>; toggle: (id: string) => void; setMany: (ids: string[], on: boolean) => void } | null>(null);

export function BulkProvider({ children }: { children: React.ReactNode }) {
  const [sel, setSel] = React.useState<Set<string>>(new Set());
  const toggle = (id: string) => setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const setMany = (ids: string[], on: boolean) => setSel((s) => { const n = new Set(s); for (const id of ids) if (on) n.add(id); else n.delete(id); return n; });
  return <Ctx.Provider value={{ sel, toggle, setMany }}>{children}</Ctx.Provider>;
}

export function RowCheck({ id, disabled, title }: { id: string; disabled?: boolean; title?: string }) {
  const ctx = React.useContext(Ctx);
  if (!ctx) return null;
  return <Checkbox checked={ctx.sel.has(id)} disabled={disabled} onCheckedChange={() => ctx.toggle(id)} aria-label="Select submission" title={title} />;
}

export function HeaderCheck({ ids }: { ids: string[] }) {
  const ctx = React.useContext(Ctx);
  if (!ctx) return null;
  const all = ids.length > 0 && ids.every((id) => ctx.sel.has(id));
  return <Checkbox checked={all} onCheckedChange={(v) => ctx.setMany(ids, !!v)} aria-label="Select all listed submissions" />;
}

export function BulkBar() {
  const ctx = React.useContext(Ctx);
  const router = useRouter();
  const { push } = useToast();
  const [open, setOpen] = React.useState(false);
  const [reason, setReason] = React.useState("");
  const [notify, setNotify] = React.useState(true);
  const [pending, start] = React.useTransition();
  if (!ctx || ctx.sel.size === 0) return null;
  const n = ctx.sel.size;
  const run = () =>
    start(async () => {
      const res = await adminBulkDeleteAction([...ctx.sel], reason, notify);
      if (!res.ok) return push({ kind: "error", title: "Nothing deleted", description: res.error });
      setOpen(false);
      setReason("");
      ctx.setMany([...ctx.sel], false);
      push({ kind: "success", title: `${res.deleted} submissions deleted`, description: `${res.emailed ? `${res.emailed} author e-mails sent. ` : ""}${res.skipped.length ? `Skipped: ${res.skipped.join("; ")}` : ""}` });
      router.refresh();
    });
  return (
    <div className="sticky bottom-4 z-20 mt-4 flex items-center justify-between gap-3 rounded-brand border border-border bg-white px-4 py-3 shadow-lg">
      <p className="text-sm text-grey-800"><span className="font-heading font-semibold text-ink">{n}</span> selected</p>
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={() => ctx.setMany([...ctx.sel], false)}>Clear</Button>
        <Button variant="danger" size="sm" onClick={() => setOpen(true)}><Trash2 /> Delete {n}…</Button>
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent title={`Delete ${n} submissions permanently?`} description="Packages, results, traces, logs and leaderboard entries are removed and cannot be recovered. Running evaluations are skipped automatically." size="md">
          <Label htmlFor="bulk-reason" required>Reason (kept in the activity log; sent to authors if ticked)</Label>
          <Textarea id="bulk-reason" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Internal smoke-test submissions, cleaning up before launch" />
          <Hint>At least 10 characters.</Hint>
          <label className="mt-3 flex items-center gap-2 text-sm text-grey-800"><Checkbox checked={notify} onCheckedChange={(v) => setNotify(!!v)} /> E-mail each owner and accepted collaborator with this reason</label>
          <DialogFooter>
            <DialogClose asChild><Button variant="outline">Cancel</Button></DialogClose>
            <Button variant="danger" onClick={run} loading={pending} disabled={reason.trim().length < 10}><ShieldAlert /> Delete {n} submissions</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
