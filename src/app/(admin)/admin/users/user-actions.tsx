"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ShieldAlert, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { Textarea, Label, Hint } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { setRoleAction, verifyUserAction, adminDeleteUserAction } from "../actions";

export function UserActions({ id, name, role, verified, isSelf, submissions }: { id: string; name: string; role: string; verified: boolean; isSelf: boolean; submissions: number }) {
  const router = useRouter();
  const { push } = useToast();
  const [pending, start] = React.useTransition();
  const [open, setOpen] = React.useState(false);
  const [reason, setReason] = React.useState("");
  const [notify, setNotify] = React.useState(true);

  const del = () =>
    start(async () => {
      const res = await adminDeleteUserAction(id, reason, notify);
      if (!res.ok) return push({ kind: "error", title: "Not deleted", description: res.error });
      setOpen(false);
      push({ kind: "success", title: res.message });
      router.refresh();
    });

  return (
    <div className="flex justify-end gap-2">
      {!verified ? <Button size="sm" variant="outline" loading={pending} onClick={() => start(() => verifyUserAction(id))}>Verify</Button> : null}
      {!isSelf ? (
        <>
          <Button size="sm" variant="outline" loading={pending} onClick={() => start(() => setRoleAction(id, role === "ADMIN" ? "USER" : "ADMIN"))}>
            {role === "ADMIN" ? "Revoke admin" : "Make admin"}
          </Button>
          {role !== "ADMIN" ? (
            <Button size="sm" variant="danger" disabled={pending} onClick={() => setOpen(true)} aria-label={`Delete ${name}`}><Trash2 /></Button>
          ) : null}
        </>
      ) : null}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent title={`Delete ${name}'s account permanently?`} description={`The account, ${submissions} submission${submissions === 1 ? "" : "s"} with their results and leaderboard entries, collaborations and test runs are removed and cannot be recovered. Running evaluations must be cancelled first.`} size="md">
          <Label htmlFor={`du-${id}`} required>Reason (kept in the activity log{notify ? "; sent to the person" : ""})</Label>
          <Textarea id={`du-${id}`} rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Account deletion requested by the user via e-mail" />
          <Hint>At least 10 characters.</Hint>
          <label className="mt-3 flex items-center gap-2 text-sm text-grey-800"><Checkbox checked={notify} onCheckedChange={(v) => setNotify(!!v)} /> E-mail the person that their account was deleted, with this reason</label>
          <DialogFooter>
            <DialogClose asChild><Button variant="outline">Cancel</Button></DialogClose>
            <Button variant="danger" onClick={del} loading={pending} disabled={reason.trim().length < 10}><ShieldAlert /> Delete account</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
