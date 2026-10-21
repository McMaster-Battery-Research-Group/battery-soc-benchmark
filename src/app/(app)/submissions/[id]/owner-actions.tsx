"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Lock, Unlock, RotateCcw, Trash2, Ban, FolderDown, FolderX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogTrigger, DialogClose } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import { togglePrivateAction, deleteSubmissionAction, requeueSubmissionAction, cancelSubmissionAction, setShareFilesAction } from "../../submit/actions";
import { ModerateButtons } from "@/app/(admin)/admin/submissions/moderate";

export function OwnerActions({ id, status, isPrivate, isHidden, isAdmin, isOwner = true, inContest, cancelRequested, shareFiles = false, hasFiles = false }: { id: string; status: string; isPrivate: boolean; isHidden: boolean; isAdmin: boolean; isOwner?: boolean; inContest: boolean; cancelRequested?: boolean; /** the authors share the package */ shareFiles?: boolean; /** the package still exists in storage */ hasFiles?: boolean }) {
  const { push } = useToast();
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [cancelling, setCancelling] = React.useState(!!cancelRequested);
  const run = (fn: () => Promise<unknown>, ok: string) =>
    start(async () => {
      try {
        await fn();
        push({ kind: "success", title: ok });
      } catch (e) {
        // A server action that redirect()s throws a NEXT_REDIRECT sentinel: let Next handle it, it is not a failure.
        if (typeof (e as { digest?: unknown })?.digest === "string" && String((e as { digest: string }).digest).startsWith("NEXT_REDIRECT")) throw e;
        push({ kind: "error", title: "Action failed", description: e instanceof Error ? e.message : String(e) });
      }
    });
  const cancel = () =>
    start(async () => {
      const res = await cancelSubmissionAction(id);
      if (!res.ok) return push({ kind: "error", title: "Could not cancel", description: res.error });
      if (res.immediate) {
        push({ kind: "success", title: "Submission cancelled and removed" });
        router.push("/submissions");
      } else {
        setCancelling(true);
        push({ kind: "success", title: "Cancelling…", description: "The evaluator is being stopped; this submission will be removed in a moment." });
      }
    });

  const inProgress = status === "QUEUED" || status === "RUNNING";
  return (
    <div className="flex shrink-0 flex-wrap gap-2">
      {isOwner && !inContest && !inProgress ? (
        <Button variant="outline" size="sm" disabled={pending} onClick={() => run(() => togglePrivateAction(id, !isPrivate), isPrivate ? "Model is now public" : "Model is now private")}>
          {isPrivate ? <Unlock /> : <Lock />} {isPrivate ? "Make public" : "Make private"}
        </Button>
      ) : null}
      {status === "FAILED" ? (
        <Button variant="secondary" size="sm" disabled={pending} onClick={() => run(() => requeueSubmissionAction(id), "Re-queued for evaluation")}><RotateCcw /> Re-run</Button>
      ) : null}
      {/* model files: can be shared while the package exists (always before the run; afterwards only if it was kept) */}
      {hasFiles && (isOwner || isAdmin) ? (
        shareFiles ? (
          <Button variant="outline" size="sm" disabled={pending} title="Delete the package; nobody will be able to download the model files" onClick={() => run(() => setShareFilesAction(id, false), "Model files are no longer shared; the package was deleted")}><FolderX /> Stop sharing files</Button>
        ) : (
          <Button variant="outline" size="sm" disabled={pending} title="Keep the package and let anyone who can see this submission download it" onClick={() => run(() => setShareFilesAction(id, true), "Model files are now shared")}><FolderDown /> Share model files</Button>
        )
      ) : null}
      {isAdmin && !isOwner ? <ModerateButtons id={id} isPrivate={isPrivate} isHidden={isHidden} status={status} /> : null}
      {inProgress ? (
        <Dialog>
          <DialogTrigger asChild><Button variant="danger" size="sm" disabled={pending || cancelling} loading={cancelling}><Ban /> {cancelling ? "Cancelling…" : "Cancel evaluation"}</Button></DialogTrigger>
          <DialogContent title="Cancel this evaluation?" description={status === "RUNNING" ? "The evaluator will be stopped on the evaluation machine and this submission removed. It does not count against any contest limit. You can submit again at any time." : "The submission will be removed from the queue. You can submit again at any time."} size="sm">
            <DialogFooter>
              <DialogClose asChild><Button variant="outline">Keep evaluating</Button></DialogClose>
              <DialogClose asChild><Button variant="danger" onClick={cancel}><Ban /> Cancel evaluation</Button></DialogClose>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : isOwner ? (
        <Dialog>
          <DialogTrigger asChild><Button variant="danger" size="sm" disabled={pending}><Trash2 /> Delete</Button></DialogTrigger>
          <DialogContent title="Delete this submission?" description="Its results are removed from the leaderboard permanently. This cannot be undone." size="sm">
            <DialogFooter>
              <DialogClose asChild><Button variant="outline">Cancel</Button></DialogClose>
              <Button variant="danger" onClick={() => run(() => deleteSubmissionAction(id), "Submission deleted")}>Delete</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : null}
    </div>
  );
}
