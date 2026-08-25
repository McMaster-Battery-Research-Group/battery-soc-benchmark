"use client";

import * as React from "react";
import { Lock, Unlock, RotateCcw, Trash2, EyeOff, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogTrigger, DialogClose } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import { togglePrivateAction, deleteSubmissionAction, requeueSubmissionAction } from "../../submit/actions";
import { toggleHiddenAction } from "@/app/(admin)/admin/actions";

export function OwnerActions({ id, status, isPrivate, isHidden, isAdmin, inContest }: { id: string; status: string; isPrivate: boolean; isHidden: boolean; isAdmin: boolean; inContest: boolean }) {
  const { push } = useToast();
  const [pending, start] = React.useTransition();
  const run = (fn: () => Promise<unknown>, ok: string) =>
    start(async () => {
      try {
        await fn();
        push({ kind: "success", title: ok });
      } catch (e) {
        push({ kind: "error", title: "Action failed", description: e instanceof Error ? e.message : String(e) });
      }
    });

  return (
    <div className="flex shrink-0 flex-wrap gap-2">
      {!inContest ? (
        <Button variant="outline" size="sm" disabled={pending} onClick={() => run(() => togglePrivateAction(id, !isPrivate), isPrivate ? "Model is now public" : "Model is now private")}>
          {isPrivate ? <Unlock /> : <Lock />} {isPrivate ? "Make public" : "Make private"}
        </Button>
      ) : null}
      {status === "FAILED" ? (
        <Button variant="secondary" size="sm" disabled={pending} onClick={() => run(() => requeueSubmissionAction(id), "Re-queued for evaluation")}><RotateCcw /> Re-run</Button>
      ) : null}
      {isAdmin ? (
        <Button variant="outline" size="sm" disabled={pending} onClick={() => run(() => toggleHiddenAction(id, !isHidden), isHidden ? "Submission unhidden" : "Submission hidden from leaderboard")}>
          {isHidden ? <Eye /> : <EyeOff />} {isHidden ? "Unhide" : "Hide"}
        </Button>
      ) : null}
      <Dialog>
        <DialogTrigger asChild><Button variant="danger" size="sm" disabled={pending || status === "RUNNING"}><Trash2 /> Delete</Button></DialogTrigger>
        <DialogContent title="Delete this submission?" description="Its results are removed from the leaderboard permanently. This cannot be undone." size="sm">
          <DialogFooter>
            <DialogClose asChild><Button variant="outline">Cancel</Button></DialogClose>
            <Button variant="danger" onClick={() => run(() => deleteSubmissionAction(id), "Submission deleted")}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
