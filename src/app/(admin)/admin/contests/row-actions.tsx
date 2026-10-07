"use client";

import Link from "next/link";
import { Copy, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogTrigger, DialogClose } from "@/components/ui/dialog";
import { deleteContestAction, duplicateContestAction } from "../actions";

/** Edit, duplicate and delete for one row of the contest list. Delete confirms first. */
export function ContestRowActions({ id, title, registrations, entries }: { id: string; title: string; registrations: number; entries: number }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button asChild size="sm"><Link href={`/admin/contests/${id}`}><Pencil /> Edit</Link></Button>
      <form action={duplicateContestAction.bind(null, id)}><Button type="submit" variant="outline" size="sm"><Copy /> Duplicate</Button></form>
      <Dialog>
        <DialogTrigger asChild><Button type="button" variant="ghost" size="sm" className="text-danger hover:bg-danger/5 hover:text-danger" aria-label={`Delete ${title}`}><Trash2 /></Button></DialogTrigger>
        <DialogContent title={`Delete "${title}"?`} description={`${registrations} registration${registrations === 1 ? "" : "s"} and any recorded results are removed. ${entries} submission${entries === 1 ? "" : "s"} stay on the site but are detached from the contest. Unpublishing is usually enough.`} size="sm">
          <DialogFooter>
            <DialogClose asChild><Button variant="outline">Cancel</Button></DialogClose>
            <Button variant="danger" onClick={() => deleteContestAction(id)}>Delete contest</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
