import { db } from "@/lib/db";
import { fmtDate } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { UserActions } from "./user-actions";
import { auth } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function AdminUsers() {
  const session = await auth();
  const users = await db.user.findMany({ orderBy: { createdAt: "desc" }, include: { _count: { select: { submissions: true } } } });
  return (
    <div>
      <h1 className="font-heading text-2xl font-bold">Users</h1>
      <div className="card mt-4 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-grey-100"><tr className="border-b border-border">{["Name", "Affiliation", "Role", "Verified", "Submissions", "Joined", ""].map((h) => <th key={h || "a"} className="h-10 px-3 text-left font-heading text-xs font-semibold uppercase tracking-wide text-grey-800">{h}</th>)}</tr></thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-b border-border">
                <td className="px-3 py-2"><div className="font-heading font-medium text-ink">{u.name}</div><div className="text-xs text-grey-600">{u.email}</div></td>
                <td className="px-3 py-2">{u.affiliation}</td>
                <td className="px-3 py-2"><Badge variant={u.role === "ADMIN" ? "maroon" : "neutral"}>{u.role}</Badge></td>
                <td className="px-3 py-2">{u.emailVerified ? <Badge variant="success">Verified</Badge> : <Badge variant="warning">Pending</Badge>}</td>
                <td className="px-3 py-2 tabular">{u._count.submissions}</td>
                <td className="whitespace-nowrap px-3 py-2 text-grey-700">{fmtDate(u.createdAt)}</td>
                <td className="px-3 py-2 text-right"><UserActions id={u.id} role={u.role} verified={!!u.emailVerified} isSelf={u.id === session?.user?.id} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
