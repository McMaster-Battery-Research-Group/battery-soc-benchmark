"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Users, X, UserPlus, UserRoundPlus, Eye, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogClose, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { Avatar } from "@/components/avatar";
import { UserPickerDialog } from "@/components/user-picker";
import { saveAuthorsAction, type AuthorDraft } from "./credit-actions";
import { cn } from "@/lib/utils";

/** `id` is null and `email` empty for a co-author an administrator credited without an account. */
export type AuthorRow = { id: string | null; name: string; email: string; affiliation?: string; avatarVersion: number | null };

type Person = { key: string; kind: AuthorDraft["kind"]; userId?: string; name: string; affiliation: string; email?: string; avatarVersion: number | null };

function initialPeople(owner: AuthorRow & { id: string }, coAuthors: AuthorRow[], credit?: { name: string | null; affiliation: string | null }) {
  const ownerRow: Person = { key: "owner", kind: "owner", userId: owner.id, name: owner.name, affiliation: owner.affiliation ?? "", email: owner.email, avatarVersion: owner.avatarVersion };
  const co: Person[] = coAuthors.map((c, i) =>
    c.id
      ? { key: `a-${c.id}`, kind: "account", userId: c.id, name: c.name, affiliation: c.affiliation ?? "", email: c.email, avatarVersion: c.avatarVersion }
      : { key: `g-${i}`, kind: "guest", name: c.name, affiliation: c.affiliation ?? "", avatarVersion: null },
  );
  // a display credit is shown in the owner's place, so the owner is not in the public list
  const people = credit?.name ? [{ key: "credit", kind: "guest", name: credit.name, affiliation: credit.affiliation ?? "", avatarVersion: null } as Person, ...co] : [ownerRow, ...co];
  return { ownerRow, people, lead: people[0].key };
}

/**
 * Administrator authorship editor. One list of the people credited publicly, in order; the lead is
 * shown first. Changes are drafted here and applied together on Save. Nobody is e-mailed.
 */
export function EditAuthorship({ id, seq, modelName, owner, coAuthors, credit }: { id: string; seq: number; modelName: string; owner: AuthorRow & { id: string }; coAuthors: AuthorRow[]; credit?: { name: string | null; affiliation: string | null } }) {
  const router = useRouter();
  const { push } = useToast();
  const init = React.useMemo(() => initialPeople(owner, coAuthors, credit), [owner, coAuthors, credit]);
  const [open, setOpen] = React.useState(false);
  const [people, setPeople] = React.useState(init.people);
  const [lead, setLead] = React.useState(init.lead);
  const [error, setError] = React.useState("");
  const [pending, start] = React.useTransition();
  const nextGuest = React.useRef(0);

  const reset = () => { setPeople(init.people); setLead(init.lead); setError(""); };
  const leader = people.find((p) => p.key === lead) ?? people[0];
  const ownerListed = people.some((p) => p.kind === "owner");
  const dirty = JSON.stringify([people, lead]) !== JSON.stringify([init.people, init.lead]);
  const controller = leader?.kind === "account" ? leader : init.ownerRow;

  const makeLead = (key: string) => {
    const p = people.find((x) => x.key === key)!;
    setLead(key);
    // someone without an account takes the owner's place; the owner cannot be listed beside them
    if (p.kind === "guest") setPeople((ps) => ps.filter((x) => x.kind !== "owner"));
  };
  const remove = (key: string) => {
    const rest = people.filter((p) => p.key !== key);
    setPeople(rest);
    if (key === lead && rest[0]) makeLeadIn(rest, rest[0].key);
  };
  const makeLeadIn = (list: Person[], key: string) => {
    setLead(key);
    if (list.find((x) => x.key === key)?.kind === "guest") setPeople(list.filter((x) => x.kind !== "owner"));
  };
  const edit = (key: string, patch: Partial<Person>) => setPeople((ps) => ps.map((p) => (p.key === key ? { ...p, ...patch } : p)));
  const addGuest = () => {
    const key = `new-${nextGuest.current++}`;
    setPeople((ps) => [...ps, { key, kind: "guest", name: "", affiliation: "", avatarVersion: null }]);
    setTimeout(() => document.getElementById(`an-${id}-${key}`)?.focus(), 0);
  };
  const showOwnerAgain = () => { setPeople((ps) => [init.ownerRow, ...ps]); setLead("owner"); };

  const save = () => {
    setError("");
    const draft: AuthorDraft[] = people.map((p) =>
      p.kind === "owner" ? { kind: "owner", key: p.key } : p.kind === "account" ? { kind: "account", key: p.key, userId: p.userId! } : { kind: "guest", key: p.key, name: p.name, affiliation: p.affiliation },
    );
    start(async () => {
      const res = await saveAuthorsAction(id, draft, lead);
      if (!res.ok) return setError(res.error);
      push({ kind: "success", title: res.message });
      setOpen(false);
      router.refresh();
    });
  };

  const ordered = leader ? [leader, ...people.filter((p) => p.key !== leader.key)] : people;

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (o) reset(); }}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="mt-1 h-auto px-1.5 py-0.5 text-xs text-grey-600" title="Edit authorship">
          <Users className="size-3.5" /> Edit authors
        </Button>
      </DialogTrigger>
      <DialogContent title={`Authors of #${seq}`} description={modelName} size="lg">
        {/* what the public will see */}
        <div className="rounded-brand border border-border bg-grey-100/70 px-4 py-3">
          <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-grey-600"><Eye className="size-3.5" /> Shown on the site as</p>
          <p className="mt-1 text-[15px] text-ink">
            {ordered.length ? ordered.map((p, i) => (
              <React.Fragment key={p.key}>{i ? ", " : ""}<span className={i === 0 ? "font-semibold" : undefined}>{p.name || "(name needed)"}</span></React.Fragment>
            )) : <span className="text-danger">Nobody. Add at least one person.</span>}
            {ordered.length === 1 && leader?.affiliation ? <span className="text-grey-700"> · {leader.affiliation}</span> : null}
          </p>
        </div>

        <ul className="mt-4 space-y-2">
          {ordered.map((p) => {
            const isLead = p.key === lead;
            return (
              <li key={p.key} className={cn("rounded-brand border px-3 py-2.5", isLead ? "border-maroon bg-maroon-100/40" : "border-border")}>
                <div className="flex items-center gap-3">
                  <Avatar userId={p.userId ?? ""} name={p.name || "?"} hasAvatar={p.avatarVersion !== null} version={p.avatarVersion} size={32} />
                  <div className="min-w-0 flex-1">
                    {p.kind === "guest" ? (
                      <div className="grid gap-1.5 sm:grid-cols-2">
                        <Input id={`an-${id}-${p.key}`} aria-label="Full name" value={p.name} placeholder="Full name" className="h-9" onChange={(e) => edit(p.key, { name: e.currentTarget.value })} />
                        <Input aria-label="Affiliation" value={p.affiliation} placeholder="Affiliation (optional)" className="h-9" onChange={(e) => edit(p.key, { affiliation: e.currentTarget.value })} />
                      </div>
                    ) : (
                      <>
                        <p className="truncate text-sm font-semibold text-ink">{p.name}</p>
                        <p className="truncate text-xs text-grey-600">{[p.affiliation, p.email].filter(Boolean).join(" · ")}</p>
                      </>
                    )}
                    <p className="mt-1 text-xs text-grey-600">{p.kind === "owner" ? "Uploaded this submission" : p.kind === "account" ? "Has an account" : "No account; listed by name only"}</p>
                  </div>
                  <label className={cn("flex shrink-0 cursor-pointer items-center gap-1.5 rounded-brand px-2 py-1 text-xs font-semibold", isLead ? "text-maroon" : "text-grey-700 hover:bg-grey-100")}>
                    <input type="radio" name={`lead-${id}`} className="size-4 accent-[#7a003c]" checked={isLead} onChange={() => makeLead(p.key)} />
                    Lead author
                  </label>
                  <Button variant="ghost" size="sm" className="shrink-0" aria-label={`Remove ${p.name || "this person"}`} title="Remove from the authors" disabled={people.length === 1} onClick={() => remove(p.key)}><X /></Button>
                </div>
              </li>
            );
          })}
        </ul>

        <div className="mt-3 flex flex-wrap gap-2">
          <UserPickerDialog
            exclude={[init.ownerRow.userId!, ...people.flatMap((p) => (p.userId ? [p.userId] : []))]}
            title="Add someone with an account"
            trigger={<Button variant="outline" size="sm"><UserPlus /> Add someone with an account</Button>}
            onAdd={async (u) => setPeople((ps) => [...ps, { key: `a-${u.id}`, kind: "account", userId: u.id, name: u.name, affiliation: u.affiliation, avatarVersion: u.avatarVersion }])}
          />
          <Button variant="outline" size="sm" onClick={addGuest}><UserRoundPlus /> Add someone without an account</Button>
          {!ownerListed ? <Button variant="tertiary" size="sm" onClick={showOwnerAgain}>Show {init.ownerRow.name} again</Button> : null}
        </div>

        <p className="mt-4 flex items-start gap-2 rounded-brand bg-grey-100/70 px-3 py-2 text-sm text-grey-800">
          <ShieldCheck className="mt-0.5 size-4 shrink-0 text-maroon" />
          <span>
            <strong>{controller.name}</strong> controls this submission (edits, new versions, deletion){!ownerListed && leader?.kind === "guest" ? ", but is not shown as an author" : ""}.
            {leader?.kind === "account" ? <> Ownership moves from {init.ownerRow.name} to {leader.name} when you save.</> : null}
          </span>
        </p>

        {error ? <p className="mt-3 text-sm text-danger">{error}</p> : null}
        <DialogFooter>
          <DialogClose asChild><Button variant="outline">Cancel</Button></DialogClose>
          <Button onClick={save} loading={pending} disabled={!dirty || !people.length}>Save changes</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
