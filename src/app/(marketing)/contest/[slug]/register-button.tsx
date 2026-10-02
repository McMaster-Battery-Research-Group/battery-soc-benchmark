"use client";

import * as React from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogTrigger, DialogClose } from "@/components/ui/dialog";
import { Field } from "@/components/forms/field";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/components/ui/toast";
import { registerForContestAction } from "../actions";

export function RegisterButton({ contestId, slug, signedIn, maxTeamSize, eligibilityStatement, eligibilityNote }: {
  contestId: string; slug: string; signedIn: boolean; maxTeamSize: number; eligibilityStatement: string | null; eligibilityNote: string | null;
}) {
  const { push } = useToast();
  const [open, setOpen] = React.useState(false);
  const [team, setTeam] = React.useState("");
  const [members, setMembers] = React.useState<string[]>(Array.from({ length: maxTeamSize - 1 }, () => ""));
  const [eligible, setEligible] = React.useState(false);
  const [agree, setAgree] = React.useState(false);
  const [pending, start] = React.useTransition();
  if (!signedIn) {
    return <Button asChild variant="gold" size="lg"><Link href={`/login?next=/contest/${slug}`}>Sign in to register</Link></Button>;
  }
  const ready = agree && (!eligibilityStatement || eligible);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button variant="gold" size="lg">Register for this contest</Button></DialogTrigger>
      <DialogContent title="Register" description={maxTeamSize > 1 ? `Registration is free. Teams of up to ${maxTeamSize}; your account submits for the team.` : "Registration is free. Entries are individual."}>
        <div className="space-y-4">
          {maxTeamSize > 1 ? (
            <>
              <Field label="Team name (optional)" name="team" value={team} onChange={(e) => setTeam(e.currentTarget.value)} placeholder="e.g. McMaster Estimation Group" maxLength={60} />
              <fieldset className="space-y-2">
                <legend className="font-heading text-sm font-semibold text-ink">Other team members (optional)</legend>
                {members.map((m, i) => (
                  <input key={i} aria-label={`Team member ${i + 2}`} value={m} maxLength={80} placeholder={`Member ${i + 2}: full name`}
                    className="h-10 w-full rounded-brand border border-border px-3 text-sm" onChange={(e) => { const v = e.currentTarget.value; setMembers((ms) => ms.map((x, j) => (j === i ? v : x))); }} />
                ))}
              </fieldset>
            </>
          ) : null}
          {eligibilityStatement ? (
            <label className="flex items-start gap-3 text-sm text-grey-800">
              <Checkbox checked={eligible} onCheckedChange={(v) => setEligible(!!v)} />
              <span>{eligibilityStatement}{eligibilityNote ? <span className="mt-1 block text-grey-600">{eligibilityNote}</span> : null}</span>
            </label>
          ) : eligibilityNote ? <p className="text-sm text-grey-700">{eligibilityNote}</p> : null}
          <label className="flex items-start gap-3 text-sm text-grey-800">
            <Checkbox checked={agree} onCheckedChange={(v) => setAgree(!!v)} />
            <span>I have read the rules and agree that contest entries are public on the contest leaderboard.</span>
          </label>
        </div>
        <DialogFooter>
          <DialogClose asChild><Button variant="outline">Cancel</Button></DialogClose>
          <Button disabled={!ready} loading={pending} onClick={() => start(async () => {
            const r = await registerForContestAction(contestId, { teamName: team, teamMembers: members, eligibilityConfirmed: eligible });
            if (!r.ok) { push({ kind: "error", title: "Registration failed", description: r.error }); return; }
            push({ kind: "success", title: "You're registered", description: "Submit entries from the Submit page once the contest opens." });
            setOpen(false);
          })}>Confirm registration</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
