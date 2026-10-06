import { db } from "@/lib/db";
import { fmtDateTime } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { UserActions } from "./user-actions";
import { auth } from "@/lib/auth";
import Link from "next/link";
import { Avatar } from "@/components/avatar";
import { guestAvatar } from "@/lib/authors";

export const dynamic = "force-dynamic";

export default async function AdminUsers() {
  const session = await auth();
  const users = await db.user.findMany({ orderBy: { createdAt: "desc" }, include: { _count: { select: { submissions: true } } } });

  // People credited on submissions without an account: display credits plus by-name co-authors, grouped by name.
  const [credited, named] = await Promise.all([
    db.submission.findMany({ where: { creditName: { not: null } }, select: { id: true, seq: true, modelName: true, creditName: true, creditAffiliation: true, creditAvatarAt: true } }),
    db.submissionCollaborator.findMany({ where: { userId: null }, select: { id: true, name: true, affiliation: true, avatarAt: true, submission: { select: { id: true, seq: true, modelName: true } } } }),
  ]);
  type Entry = { id: string; seq: number; modelName: string; role: "author" | "co-author" };
  const people = new Map<string, { name: string; affiliation: string; avatarSrc: string | null; entries: Entry[] }>();
  const add = (name: string, affiliation: string | null, avatarSrc: string | null, e: Entry) => {
    const k = name.trim().toLowerCase();
    const cur = people.get(k) ?? { name: name.trim(), affiliation: "", avatarSrc: null, entries: [] };
    cur.affiliation ||= affiliation ?? "";
    cur.avatarSrc ||= avatarSrc;
    cur.entries.push(e);
    people.set(k, cur);
  };
  for (const s of credited) add(s.creditName!, s.creditAffiliation, guestAvatar(s.id, "credit", s.creditAvatarAt, s.creditName!), { id: s.id, seq: s.seq, modelName: s.modelName, role: "author" });
  for (const c of named) add(c.name ?? "Unnamed", c.affiliation, guestAvatar(c.submission.id, c.id, c.avatarAt, c.name ?? ""), { ...c.submission, role: "co-author" });
  const namedAuthors = [...people.values()].sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div>
      <h1 className="font-heading text-2xl font-bold">Users</h1>
      <div className="card mt-4 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-grey-100"><tr className="border-b border-border">{["Name", "Affiliation", "Status", "Subs", "Joined", ""].map((h) => <th key={h || "a"} className="h-10 px-3 text-left font-heading text-xs font-semibold uppercase tracking-wide text-grey-800">{h}</th>)}</tr></thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-b border-border">
                <td className="px-3 py-2"><div className="font-heading font-medium text-ink">{u.name}</div><div className="text-xs text-grey-600">{u.email}</div></td>
                <td className="max-w-56 px-3 py-2 text-grey-800">{u.affiliation}</td>
                <td className="whitespace-nowrap px-3 py-2"><span className="inline-flex gap-1.5">{u.role === "ADMIN" ? <Badge variant="maroon">Admin</Badge> : null}{u.emailVerified ? <Badge variant="success">Verified</Badge> : <Badge variant="warning">Pending</Badge>}</span></td>
                <td className="px-3 py-2 text-center tabular">{u._count.submissions}</td>
                <td className="whitespace-nowrap px-3 py-2 text-grey-700">{fmtDateTime(u.createdAt)}</td>
                <td className="whitespace-nowrap px-3 py-2 text-right"><UserActions id={u.id} name={u.name} role={u.role} verified={!!u.emailVerified} isSelf={u.id === session?.user?.id} submissions={u._count.submissions} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 className="mt-10 font-heading text-xl font-bold">Named authors</h2>
      <p className="mt-1 max-w-3xl text-sm text-grey-700">
        People credited on submissions who have no account: entries filed on their behalf, or co-authors added by name. They have no login, profile page or e-mails.
        Edit them on each submission with <strong>Edit authors</strong>. If one of them registers, open the submission&apos;s Edit authors, add their account and remove the name.
      </p>
      <div className="card mt-4 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-grey-100"><tr className="border-b border-border">{["Name", "Affiliation", "Credited on", ""].map((h) => <th key={h || "a"} className="h-10 px-3 text-left font-heading text-xs font-semibold uppercase tracking-wide text-grey-700">{h}</th>)}</tr></thead>
          <tbody>
            {namedAuthors.map((p) => (
              <tr key={p.name.toLowerCase()} className="border-b border-border">
                <td className="px-3 py-2">
                  <div className="flex items-center gap-2.5">
                    <Avatar userId="" name={p.name} hasAvatar={false} src={p.avatarSrc} size={30} />
                    <div><div className="font-heading font-medium text-ink">{p.name}</div><div className="text-xs text-grey-600">No account</div></div>
                  </div>
                </td>
                <td className="max-w-56 px-3 py-2 text-grey-800">{p.affiliation || <span className="text-grey-500">not given</span>}</td>
                <td className="px-3 py-2 text-grey-800">
                  <ul className="space-y-0.5">
                    {p.entries.map((e) => (
                      <li key={`${e.id}-${e.role}`}><Link href={`/submissions/${e.id}`} className="text-ink hover:text-maroon hover:underline">#{e.seq} {e.modelName}</Link> <span className="text-xs text-grey-600">· {e.role}</span></li>
                    ))}
                  </ul>
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-right text-xs text-grey-600">{p.avatarSrc ? (p.avatarSrc.startsWith("/people/") ? "team photo" : "photo set") : "no photo"}</td>
              </tr>
            ))}
            {namedAuthors.length === 0 ? <tr><td colSpan={4} className="px-3 py-6 text-center text-sm text-grey-600">Nobody is credited without an account.</td></tr> : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
