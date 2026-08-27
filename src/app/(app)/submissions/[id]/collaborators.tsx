"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { X, Users, Send, MailCheck, Clock, Check, BadgeCheck, RefreshCw } from "lucide-react";
import { Avatar } from "@/components/avatar";
import { UserPickerDialog } from "@/components/user-picker";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/misc";
import { Dialog, DialogContent, DialogFooter, DialogTrigger, DialogClose } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import { addCollaboratorAction, removeCollaboratorAction, notifyCollaboratorsAction, respondToInviteAction, resendInviteAction } from "../../submit/actions";

export type Collaborator = { id: string; name: string; affiliation: string; avatarVersion: number | null; notified: boolean; accepted: boolean };
type Person = Omit<Collaborator, "notified" | "accepted">;

/**
 * Co-authors on a submission, in three states:
 *   Pending   — added by the owner, no e-mail yet (owner can still remove silently)
 *   Invited   — owner confirmed; invitation e-mail sent; not yet public
 *   Co-author — accepted; shown on the leaderboard and researcher pages
 */
export function Collaborators({ submissionId, owner, list, canEdit, viewerId }: { submissionId: string; owner: Person; list: Collaborator[]; canEdit: boolean; viewerId?: string }) {
  const router = useRouter();
  const { push } = useToast();
  const [pending, start] = React.useTransition();
  const [added, setAdded] = React.useState<string[]>([]);
  const unnotified = list.filter((c) => !c.notified);
  const myInvite = viewerId ? list.find((c) => c.id === viewerId && c.notified && !c.accepted) : undefined;

  const remove = (userId: string) =>
    start(async () => {
      try {
        await removeCollaboratorAction(submissionId, userId);
        push({ kind: "success", title: userId === viewerId ? "You left this submission" : "Collaborator removed" });
        router.refresh();
      } catch (e) {
        push({ kind: "error", title: "Could not remove", description: e instanceof Error ? e.message : String(e) });
      }
    });

  const notify = () =>
    start(async () => {
      const res = await notifyCollaboratorsAction(submissionId);
      if (res.ok) push({ kind: "success", title: `${res.sent} invitation${res.sent === 1 ? "" : "s"} sent (you were CC'd)` });
      else push({ kind: "error", title: "Nothing sent", description: res.error });
      router.refresh();
    });

  const resend = (userId: string, name: string) =>
    start(async () => {
      const res = await resendInviteAction(submissionId, userId);
      if (res.ok) push({ kind: "success", title: `Invitation re-sent to ${name}` });
      else push({ kind: "error", title: "Not re-sent", description: res.error });
      router.refresh();
    });

  const respond = (accept: boolean) =>
    start(async () => {
      const res = await respondToInviteAction({ submissionId }, accept);
      if (res.ok) push({ kind: "success", title: accept ? "You are now listed as a co-author" : "Invitation declined" });
      else push({ kind: "error", title: "Could not respond", description: res.error });
      router.refresh();
    });

  if (!canEdit && !list.length) return null;

  return (
    <section className="card mt-6 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 font-heading text-lg font-semibold text-ink"><Users className="size-5 text-maroon" /> Authors</h2>
          <p className="mt-1 text-sm text-grey-700">Collaborators can view this submission even while it is private and, once invited, receive the results e-mail and PDF report. They appear publicly beside the model only after accepting the invitation.</p>
        </div>
        {canEdit ? (
          <UserPickerDialog
            suggestFor={submissionId}
            exclude={[owner.id, ...list.map((c) => c.id), ...added]}
            onAdd={async (u) => {
              const res = await addCollaboratorAction(submissionId, u.id);
              if (!res.ok) throw new Error(res.error);
              setAdded((a) => [...a, u.id]);
              push({ kind: "success", title: `${u.name} added as pending`, description: "No e-mail yet — review the list, then press Send invitations." });
              router.refresh();
            }}
          />
        ) : null}
      </div>

      {myInvite ? (
        <Alert variant="warning" className="mt-4" title={`${owner.name} listed you as a co-author`}>
          <p>Accept to be shown publicly beside this model, or decline to be removed (the owner is told either way).</p>
          <div className="mt-3 flex gap-2">
            <Button size="sm" onClick={() => respond(true)} loading={pending}><Check /> Accept</Button>
            <Button size="sm" variant="outline" onClick={() => respond(false)} disabled={pending}><X /> Decline</Button>
          </div>
        </Alert>
      ) : null}

      {canEdit && unnotified.length ? (
        <Alert variant="warning" className="mt-4" title={`${unnotified.length} pending collaborator${unnotified.length === 1 ? "" : "s"} not invited yet`}>
          <p>Check the names below. Remove anyone added by mistake, then send the invitations. Pending collaborators receive no e-mails and are not shown publicly until they accept.</p>
          <Dialog>
            <DialogTrigger asChild><Button size="sm" className="mt-3" disabled={pending}><Send /> Send invitation{unnotified.length === 1 ? ` to ${unnotified[0].name}` : `s (${unnotified.length})`}</Button></DialogTrigger>
            <DialogContent title="Send invitation e-mails?" description="Each person below receives an e-mail with Accept / Decline links, and you are CC'd. This cannot be unsent." size="sm">
              <ul className="divide-y divide-border rounded-brand border border-border">
                {unnotified.map((c) => (
                  <li key={c.id} className="flex items-center gap-3 px-3 py-2">
                    <Avatar userId={c.id} name={c.name} hasAvatar={c.avatarVersion !== null} version={c.avatarVersion} size={30} />
                    <span className="min-w-0"><span className="block truncate font-heading font-medium text-ink">{c.name}</span><span className="block truncate text-xs text-grey-600">{c.affiliation}</span></span>
                  </li>
                ))}
              </ul>
              <DialogFooter>
                <DialogClose asChild><Button variant="outline">Not yet</Button></DialogClose>
                <DialogClose asChild><Button onClick={notify} loading={pending}><Send /> Send</Button></DialogClose>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </Alert>
      ) : null}

      <ul className="mt-4 grid gap-2 sm:grid-cols-2">
        <PersonCard p={owner} role="Owner" state="owner" />
        {list.map((c) => (
          <PersonCard key={c.id} p={c} role={c.accepted ? "Co-author" : c.notified ? "Invited — awaiting reply" : "Pending — not invited"} state={c.accepted ? "accepted" : c.notified ? "invited" : "pending"} onRemove={canEdit || c.id === viewerId ? () => remove(c.id) : undefined} removeLabel={c.id === viewerId ? "Leave" : "Remove"} onResend={canEdit && c.notified && !c.accepted ? () => resend(c.id, c.name) : undefined} pending={pending} />
        ))}
      </ul>
    </section>
  );
}

function PersonCard({ p, role, state, onRemove, removeLabel, onResend, pending }: { p: Person; role: string; state: "owner" | "pending" | "invited" | "accepted"; onRemove?: () => void; removeLabel?: string; onResend?: () => void; pending?: boolean }) {
  const Icon = state === "pending" ? Clock : state === "invited" ? MailCheck : state === "accepted" ? BadgeCheck : null;
  const iconColor = state === "pending" ? "text-[#9a6a17]" : state === "invited" ? "text-bayfront" : "text-forest";
  return (
    <li className={`flex items-center gap-3 rounded-brand border px-3 py-2 ${state === "pending" ? "border-dashed border-gold-400 bg-gold-200/40" : state === "invited" ? "border-dashed border-border" : "border-border"}`}>
      <Avatar userId={p.id} name={p.name} hasAvatar={p.avatarVersion !== null} version={p.avatarVersion} size={36} className={state === "invited" || state === "pending" ? "opacity-70" : undefined} />
      <span className="min-w-0 flex-1">
        <Link href={`/users/${p.id}`} className="block truncate font-heading font-medium text-ink hover:text-maroon hover:underline">{p.name}</Link>
        <span className="flex items-center gap-1 truncate text-xs text-grey-600">
          {p.affiliation} · {role}
          {Icon ? <Icon className={`size-3 ${iconColor}`} aria-hidden /> : null}
        </span>
      </span>
      {onResend ? (
        <button type="button" onClick={onResend} disabled={pending} className="inline-flex items-center gap-1 rounded-brand px-2 py-1 font-heading text-xs font-medium text-maroon hover:bg-maroon-100" title="Send the invitation e-mail again (once per 12 h)"><RefreshCw className="size-3.5" /> Resend invite</button>
      ) : null}
      {onRemove ? (
        <button type="button" onClick={onRemove} disabled={pending} className="rounded-brand p-1 text-grey-500 hover:bg-grey-100 hover:text-danger" aria-label={`${removeLabel ?? "Remove"} ${p.name}`} title={removeLabel}><X className="size-4" /></button>
      ) : null}
    </li>
  );
}
