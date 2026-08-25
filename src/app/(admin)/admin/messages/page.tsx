import { db } from "@/lib/db";
import { fmtDateTime } from "@/lib/utils";
import { ResolveToggle } from "./resolve-toggle";
import { EmptyState } from "@/components/ui/misc";
import { Inbox } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export const dynamic = "force-dynamic";

export default async function AdminMessages() {
  const msgs = await db.contactMessage.findMany({ orderBy: [{ resolved: "asc" }, { createdAt: "desc" }], take: 200 });
  return (
    <div>
      <h1 className="font-heading text-2xl font-bold">Messages</h1>
      {msgs.length === 0 ? <div className="mt-4"><EmptyState icon={Inbox} title="Inbox is empty" description="Messages from the contact form appear here." /></div> : (
        <ul className="mt-4 space-y-3">
          {msgs.map((m) => (
            <li key={m.id} className={`card p-4 ${m.resolved ? "opacity-60" : ""}`}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="flex flex-wrap items-center gap-2 font-heading font-semibold text-ink"><Badge variant={m.category === "bug" ? "danger" : m.category === "feature" ? "info" : "neutral"}>{m.category}</Badge>{m.subject}</p>
                  <p className="text-xs text-grey-600">{m.name} · <a href={`mailto:${m.email}?subject=Re: ${encodeURIComponent(m.subject)}`} className="text-maroon underline">{m.email}</a> · {fmtDateTime(m.createdAt)}{m.pageUrl ? <> · from <span className="font-mono">{m.pageUrl}</span></> : null}</p>
                </div>
                <ResolveToggle id={m.id} resolved={m.resolved} />
              </div>
              <p className="mt-3 whitespace-pre-wrap text-sm text-grey-800">{m.body}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
