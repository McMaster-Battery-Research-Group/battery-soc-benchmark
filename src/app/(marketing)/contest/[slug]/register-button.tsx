"use client";

import * as React from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogTrigger, DialogClose } from "@/components/ui/dialog";
import { Field } from "@/components/forms/field";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/components/ui/toast";
import { registerForContestAction } from "../actions";

export function RegisterButton({ contestId, signedIn }: { contestId: string; signedIn: boolean }) {
  const { push } = useToast();
  const [open, setOpen] = React.useState(false);
  const [team, setTeam] = React.useState("");
  const [agree, setAgree] = React.useState(false);
  const [pending, start] = React.useTransition();
  if (!signedIn) {
    return <Button asChild variant="gold" size="lg"><Link href="/login?next=/contest">Sign in to register</Link></Button>;
  }
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button variant="gold" size="lg">Register for this contest</Button></DialogTrigger>
      <DialogContent title="Register" description="Registration is free. Your account submits on behalf of your team.">
        <div className="space-y-4">
          <Field label="Team name (optional)" name="team" value={team} onChange={(e) => setTeam(e.currentTarget.value)} placeholder="e.g. MARC Estimation Group" maxLength={60} />
          <label className="flex items-start gap-3 text-sm text-grey-800">
            <Checkbox checked={agree} onCheckedChange={(v) => setAgree(!!v)} />
            <span>I have read the rules and eligibility requirements and agree that contest entries are public on the contest leaderboard.</span>
          </label>
        </div>
        <DialogFooter>
          <DialogClose asChild><Button variant="outline">Cancel</Button></DialogClose>
          <Button disabled={!agree} loading={pending} onClick={() => start(async () => { try { await registerForContestAction(contestId, team); push({ kind: "success", title: "You're registered", description: "Submit entries from the Submit page." }); setOpen(false); } catch (e) { push({ kind: "error", title: "Registration failed", description: e instanceof Error ? e.message : String(e) }); } })}>Confirm registration</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
