"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Users, Crown, X, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogClose, DialogTrigger } from "@/components/ui/dialog";
import { Hint, Input, Label } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { Avatar } from "@/components/avatar";
import { UserPickerDialog } from "@/components/user-picker";
import { adminSetSubmissionOwnerAction, adminAddCoAuthorAction, adminRemoveCoAuthorAction, adminAddCreditAction, adminRemoveCreditAction } from "../actions";

/** `id` is null and `email` empty for a co-author an administrator credited without an account. */
export type AuthorRow = { id: string | null; name: string; email: string; affiliation?: string; avatarVersion: number | null };

/**
 * Administrator authorship editor: change who owns a submission and who is credited
 * alongside them. For correcting entries created on someone's behalf or carried over
 * from the previous platform — no invitation e-mails are sent, people are simply listed.
 */
export function EditAuthorship({ id, seq, modelName, owner, coAuthors }: { id: string; seq: number; modelName: string; owner: AuthorRow & { id: string }; coAuthors: AuthorRow[] }) {
  const router = useRouter();
  const { push } = useToast();
  const [open, setOpen] = React.useState(false);
  const [pending, start] = React.useTransition();
  const [keepFormerOwner, setKeepFormerOwner] = React.useState(true);
  const [creditName, setCreditName] = React.useState("");
  const [creditAffil, setCreditAffil] = React.useState("");

  const run = (fn: () => Promise<{ ok: true; message: string } | { ok: false; error: string }>, failTitle: string) =>
    start(async () => {
      const res = await fn();
      if (!res.ok) return push({ kind: "error", title: failTitle, description: res.error });
      push({ kind: "success", title: res.message });
      router.refresh();
    });

  const everyone = [owner.id, ...coAuthors.flatMap((c) => (c.id ? [c.id] : []))];

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="mt-1 h-auto px-1.5 py-0.5 text-xs text-grey-600" title="Edit authorship">
          <Users className="size-3.5" /> Edit authors
        </Button>
      </DialogTrigger>
      <DialogContent title={`Authorship of #${seq}`} description={modelName} size="sm">
        <p className="text-sm text-grey-700">
          Corrects who is credited. The owner controls the submission and appears first everywhere; co-authors are shown beside them. Nobody is e-mailed.
        </p>

        <h4 className="mt-4 font-heading text-xs font-semibold uppercase tracking-wide text-grey-600">Owner</h4>
        <div className="mt-1.5 flex items-center gap-2.5 rounded-brand border border-border px-3 py-2">
          <Avatar userId={owner.id} name={owner.name} hasAvatar={owner.avatarVersion !== null} version={owner.avatarVersion} size={30} />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm text-grey-900">{owner.name}</span>
            <span className="block truncate text-xs text-grey-600">{owner.email}</span>
          </span>
          <UserPickerDialog
            exclude={[owner.id]}
            title="Choose the new owner"
            trigger={<Button variant="outline" size="sm" disabled={pending}><Crown /> Change</Button>}
            onAdd={async (u) => {
              run(() => adminSetSubmissionOwnerAction(id, u.id, keepFormerOwner), "Could not change the owner");
            }}
          />
        </div>
        <label className="mt-2 flex items-start gap-2 text-sm text-grey-700">
          <input type="checkbox" className="mt-0.5" checked={keepFormerOwner} onChange={(e) => setKeepFormerOwner(e.target.checked)} />
          <span>Keep the former owner as a co-author</span>
        </label>
        <Hint>Leave this on unless the submission was filed under the wrong person entirely.</Hint>

        <h4 className="mt-5 font-heading text-xs font-semibold uppercase tracking-wide text-grey-600">Co-authors</h4>
        {coAuthors.length ? (
          <ul className="mt-1.5 divide-y divide-border rounded-brand border border-border">
            {coAuthors.map((c) => (
              <li key={c.id ?? `x${c.name}`} className="flex items-center gap-2.5 px-3 py-2">
                <Avatar userId={c.id ?? ""} name={c.name} hasAvatar={c.avatarVersion !== null} version={c.avatarVersion} size={26} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-grey-900">{c.name}</span>
                  <span className="block truncate text-xs text-grey-600">{c.email || c.affiliation || "no account — credited by an administrator"}</span>
                </span>
                <Button variant="ghost" size="sm" disabled={pending} title={`Remove ${c.name}`} onClick={() => run(() => (c.id ? adminRemoveCoAuthorAction(id, c.id) : adminRemoveCreditAction(id, c.name)), "Could not remove the co-author")}>
                  <X />
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-1.5 text-sm text-grey-600">None listed.</p>
        )}
        <div className="mt-2">
          <UserPickerDialog
            exclude={everyone}
            title="Add a co-author"
            trigger={<Button variant="secondary" size="sm" disabled={pending}><UserPlus /> Add co-author with an account</Button>}
            onAdd={async (u) => {
              run(() => adminAddCoAuthorAction(id, u.id), "Could not add the co-author");
            }}
          />
        </div>

        <h4 className="mt-5 font-heading text-xs font-semibold uppercase tracking-wide text-grey-600">Credit someone without an account</h4>
        <Hint>For co-authors who will never use the platform, or entries carried over from the previous system. They are listed but get no profile page and no e-mail.</Hint>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          <span>
            <Label htmlFor={`cn-${id}`}>Full name</Label>
            <Input id={`cn-${id}`} value={creditName} onChange={(e) => setCreditName(e.target.value)} placeholder="Jane Smith" />
          </span>
          <span>
            <Label htmlFor={`ca-${id}`}>Affiliation (optional)</Label>
            <Input id={`ca-${id}`} value={creditAffil} onChange={(e) => setCreditAffil(e.target.value)} placeholder="McMaster University" />
          </span>
        </div>
        <Button
          variant="secondary"
          size="sm"
          className="mt-2"
          disabled={pending || creditName.trim().length < 2}
          onClick={() =>
            run(async () => {
              const res = await adminAddCreditAction(id, creditName, creditAffil);
              if (res.ok) {
                setCreditName("");
                setCreditAffil("");
              }
              return res;
            }, "Could not add the credit")
          }
        >
          <UserPlus /> Add credit
        </Button>

        <DialogFooter>
          <DialogClose asChild><Button variant="secondary">Done</Button></DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
