"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, Lock, Unlock, Trash2, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { Textarea, Label, Hint } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { adminModerateAction, type ModerationAction } from "../actions";

const LABEL: Record<ModerationAction, { verb: string; title: string; body: string; danger?: boolean }> = {
  private: { verb: "Make private", title: "Make this submission private?", body: "It disappears from the public leaderboard and researcher pages; the owner and collaborators keep access. They will be e-mailed with your reason." },
  public: { verb: "Make public", title: "Make this submission public?", body: "It appears on the leaderboard. The owner and collaborators will be e-mailed with your reason." },
  hide: { verb: "Hide", title: "Hide this submission?", body: "Hidden submissions are invisible to everyone except administrators — use for rule violations or suspected cheating. The owner and collaborators will be e-mailed with your reason." },
  unhide: { verb: "Unhide", title: "Unhide this submission?", body: "It becomes visible again according to its private/public setting. The owner and collaborators will be e-mailed." },
  delete: { verb: "Delete", title: "Delete this submission permanently?", body: "Results, logs and leaderboard entry are removed and cannot be recovered. The owner and collaborators will be e-mailed with your reason.", danger: true },
};

/** Administrator moderation controls with a mandatory reason; used on the admin table and the submission page. */
export function ModerateButtons({ id, isPrivate, isHidden, status, compact = false }: { id: string; isPrivate: boolean; isHidden: boolean; status: string; compact?: boolean }) {
  const router = useRouter();
  const { push } = useToast();
  const [pending, start] = React.useTransition();
  const [action, setAction] = React.useState<ModerationAction | null>(null);
  const [reason, setReason] = React.useState("");

  const run = () => {
    if (!action) return;
    start(async () => {
      const res = await adminModerateAction(id, action, reason);
      setAction(null);
      setReason("");
      if (!res.ok) return push({ kind: "error", title: "Moderation failed", description: res.error });
      push({ kind: "success", title: res.message });
      if (action === "delete") router.push("/admin/submissions");
      else router.refresh();
    });
  };
  const size = compact ? "sm" : "sm";
  const done = status === "COMPLETED" || status === "FAILED";

  return (
    <>
      <div className="flex flex-wrap gap-1.5">
        {done ? (
          <Button variant="outline" size={size} disabled={pending} onClick={() => setAction(isPrivate ? "public" : "private")} title={isPrivate ? "Make public" : "Make private"}>
            {isPrivate ? <Unlock /> : <Lock />} {compact ? null : isPrivate ? "Make public" : "Make private"}
          </Button>
        ) : null}
        <Button variant={isHidden ? "secondary" : "outline"} size={size} disabled={pending} onClick={() => setAction(isHidden ? "unhide" : "hide")} title={isHidden ? "Unhide" : "Hide"}>
          {isHidden ? <Eye /> : <EyeOff />} {compact ? null : isHidden ? "Unhide" : "Hide"}
        </Button>
        <Button variant="danger" size={size} disabled={pending || status === "RUNNING"} onClick={() => setAction("delete")} title="Delete">
          <Trash2 /> {compact ? null : "Delete"}
        </Button>
      </div>
      <Dialog open={!!action} onOpenChange={(o) => !o && setAction(null)}>
        {action ? (
          <DialogContent title={LABEL[action].title} description={LABEL[action].body} size="sm">
            <div>
              <Label htmlFor="mod-reason" required>Reason (sent to the author{action === "delete" ? "; keep a copy for your records" : ""})</Label>
              <Textarea id="mod-reason" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Model appears to use blinded data; contest rule 4.2; duplicate of #58…" />
              <Hint>At least 10 characters. Shown verbatim in the e-mail.</Hint>
            </div>
            <DialogFooter>
              <DialogClose asChild><Button variant="outline">Cancel</Button></DialogClose>
              <Button variant={LABEL[action].danger ? "danger" : "primary"} onClick={run} loading={pending} disabled={reason.trim().length < 10}><ShieldAlert /> {LABEL[action].verb} & notify</Button>
            </DialogFooter>
          </DialogContent>
        ) : null}
      </Dialog>
    </>
  );
}
