"use client";

import * as React from "react";
import Link from "next/link";
import { UserPlus, Search, Check } from "lucide-react";
import { Avatar } from "@/components/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { searchUsersAction, suggestUsersAction, type UserHit } from "@/app/actions/users";

/**
 * "Add collaborator" dialog: suggestions first, then live search of registered
 * users. `onAdd` resolves when the person has been added (or throws with a
 * message); the dialog stays open so several people can be added in one go.
 */
export function UserPickerDialog({ exclude, onAdd, suggestFor, trigger, title = "Add a collaborator" }: { exclude: string[]; onAdd: (u: UserHit) => Promise<void>; suggestFor?: string; trigger?: React.ReactNode; title?: string }) {
  const [open, setOpen] = React.useState(false);
  const [q, setQ] = React.useState("");
  const [hits, setHits] = React.useState<UserHit[]>([]);
  const [searching, setSearching] = React.useState(false);
  const [adding, setAdding] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [suggested, setSuggested] = React.useState<{ hit: UserHit; reason: string }[] | null>(null);
  const excluded = new Set(exclude);

  React.useEffect(() => {
    if (!open) return;
    let alive = true;
    suggestUsersAction(suggestFor).then((s) => alive && setSuggested(s));
    return () => {
      alive = false;
    };
  }, [open, suggestFor]);

  React.useEffect(() => {
    if (!open) return;
    if (q.trim().length < 2) {
      setHits([]);
      return;
    }
    let alive = true;
    setSearching(true);
    const t = setTimeout(async () => {
      const res = await searchUsersAction(q);
      if (alive) {
        setHits(res);
        setSearching(false);
      }
    }, 250);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [q, open]);

  const add = async (u: UserHit) => {
    setAdding(u.id);
    setError(null);
    try {
      await onAdd(u);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setAdding(null);
    }
  };

  const typing = q.trim().length >= 2;
  const rows: { u: UserHit; reason?: string }[] = typing ? hits.map((u) => ({ u })) : (suggested ?? []).filter((s) => !excluded.has(s.hit.id)).map((s) => ({ u: s.hit, reason: s.reason }));

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) { setQ(""); setHits([]); setError(null); } }}>
      <DialogTrigger asChild>{trigger ?? <Button variant="secondary" size="sm"><UserPlus /> Add collaborator</Button>}</DialogTrigger>
      <DialogContent title={title} description="Search registered users by name or affiliation, or paste their exact account email. They must have an account first." size="sm">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-grey-500" />
          <Input autoFocus placeholder="Search people…" value={q} onChange={(e) => setQ(e.target.value)} className="pl-9" aria-label="Search users" />
        </div>
        {error ? <p className="mt-2 text-xs text-danger">{error}</p> : null}
        {!typing ? <p className="mt-3 font-heading text-xs font-semibold uppercase tracking-wide text-grey-600">{suggested === null ? "Loading suggestions…" : rows.length ? "Suggested" : ""}</p> : null}
        <ul className={`${typing ? "mt-3" : "mt-1.5"} max-h-72 divide-y divide-border overflow-y-auto rounded-brand border border-border`} aria-live="polite">
          {typing && searching && !hits.length ? (
            <li className="px-3 py-6 text-center text-sm text-grey-600">Searching…</li>
          ) : typing && !hits.length ? (
            <li className="px-3 py-6 text-center text-sm text-grey-600">No registered users match. Ask them to <Link href="/register" className="text-maroon underline">create an account</Link>.</li>
          ) : !typing && suggested !== null && !rows.length ? (
            <li className="px-3 py-6 text-center text-sm text-grey-600">Start typing a name, affiliation or account email.</li>
          ) : (
            rows.map((r) => <UserRow key={r.u.id} u={r.u} reason={r.reason} done={excluded.has(r.u.id)} adding={adding} onAdd={() => add(r.u)} />)
          )}
        </ul>
      </DialogContent>
    </Dialog>
  );
}

function UserRow({ u, reason, done, adding, onAdd }: { u: UserHit; reason?: string; done: boolean; adding: string | null; onAdd: () => void }) {
  return (
    <li className="flex items-center gap-3 px-3 py-2">
      <Avatar userId={u.id} name={u.name} hasAvatar={u.avatarVersion !== null} version={u.avatarVersion} size={34} />
      <span className="min-w-0 flex-1">
        <span className="block truncate font-heading font-medium text-ink">{u.name}</span>
        <span className="block truncate text-xs text-grey-600">{[u.occupation, u.affiliation].filter(Boolean).join(" · ")}</span>
        {reason ? <span className="block truncate text-[11px] text-maroon">{reason}</span> : null}
      </span>
      {done ? (
        <span className="inline-flex items-center gap-1 text-xs text-forest"><Check className="size-3.5" /> Added</span>
      ) : (
        <Button size="sm" variant="outline" onClick={onAdd} loading={adding === u.id} disabled={adding !== null}>Add</Button>
      )}
    </li>
  );
}
