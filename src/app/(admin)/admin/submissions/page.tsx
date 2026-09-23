import Link from "next/link";
import { db } from "@/lib/db";
import { fmtDate, fmtDateTime, fmtPct } from "@/lib/utils";
import { StatusBadge, Badge } from "@/components/ui/badge";
import { NativeSelect } from "@/components/ui/input";
import { CURRENT_EVALUATOR_VERSION, isCurrentBenchmark } from "@/lib/benchmark-version";
import { ModerateButtons } from "./moderate";
import { EditAuthorship } from "./authorship";
import { BulkProvider, RowCheck, HeaderCheck, BulkBar } from "./bulk-delete";
import { Avatar } from "@/components/avatar";

export const dynamic = "force-dynamic";

/** Affiliation recorded for an administrator-entered credit, if any. */
function c_affil(s: { collaborators: { name: string | null; affiliation: string | null; user: unknown }[] }, name: string) {
  return s.collaborators.find((c) => !c.user && c.name === name)?.affiliation ?? "";
}

export default async function AdminSubmissions({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const { status } = await searchParams;
  const subs = await db.submission.findMany({
    where: status ? { status: status as "QUEUED" | "RUNNING" | "COMPLETED" | "FAILED" } : {},
    orderBy: { submittedAt: "desc" },
    take: 200,
    include: {
      user: { select: { id: true, name: true, email: true, avatarUpdatedAt: true } },
      collaborators: { include: { user: { select: { id: true, name: true, email: true, avatarUpdatedAt: true } } }, orderBy: { addedAt: "asc" } },
      result: { select: { weightedError: true, evaluatorVersion: true } },
      contest: { select: { title: true } },
    },
  });
  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-bold">Submissions</h1>
          <p className="mt-1 text-sm text-grey-700">{subs.length} shown{status ? ` · ${status}` : ""}. Moderation actions ask for a reason and e-mail the author and accepted collaborators.</p>
        </div>
        <form className="flex items-center gap-2 text-sm">
          <label htmlFor="status" className="text-grey-700">Status</label>
          <NativeSelect id="status" name="status" defaultValue={status ?? ""} className="h-9 w-40 text-sm">
            <option value="">All</option><option>QUEUED</option><option>RUNNING</option><option>COMPLETED</option><option>FAILED</option>
          </NativeSelect>
          <button className="rounded-brand border border-border px-3 py-1.5 font-heading text-sm font-medium hover:bg-grey-100">Filter</button>
        </form>
      </div>
      {/* The card scrolls horizontally on narrow screens; the sticky first columns keep the model identifiable. */}
      <BulkProvider>
      <div className="card mt-4 max-w-full overflow-x-auto">
        <table className="w-full min-w-[860px] text-sm">
          <thead className="bg-grey-100">
            <tr className="border-b border-border">
              <th className="h-10 px-3"><HeaderCheck ids={subs.filter((x) => x.status !== "RUNNING").map((x) => x.id)} /></th>
              {["#", "Model", "Authors", "Status", "Weighted", "Submitted", "Actions"].map((h) => (
                <th key={h} className="h-10 whitespace-nowrap px-3 text-left font-heading text-xs font-semibold uppercase tracking-wide text-grey-800">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {subs.map((s) => {
              const legacy = s.result && !isCurrentBenchmark(s.result.evaluatorVersion);
              return (
                <tr key={s.id} className="border-b border-border align-top">
                  <td className="px-3 py-2.5"><RowCheck id={s.id} disabled={s.status === "RUNNING"} title={s.status === "RUNNING" ? "Running — cancel the evaluation first" : undefined} /></td>
                  <td className="px-3 py-2.5 tabular text-grey-600">{s.seq}</td>
                  <td className="max-w-[320px] px-3 py-2.5">
                    <Link href={`/submissions/${s.id}`} className="font-heading font-medium text-ink hover:text-maroon">{s.modelName}</Link>
                    <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-grey-600">
                      {s.isHidden ? <Badge variant="danger">Hidden</Badge> : s.isPrivate ? <Badge>Private</Badge> : null}
                      {s.contest ? <Badge variant="gold">{s.contest.title}</Badge> : null}
                      {legacy ? <Badge variant="warning" title={`Evaluated with ${s.result!.evaluatorVersion}; current is ${CURRENT_EVALUATOR_VERSION}`}>legacy scoring</Badge> : null}
                    </div>
                    {s.failureMessage ? <p className="mt-0.5 line-clamp-2 text-xs text-danger" title={s.failureMessage}>{s.failureMessage}</p> : null}
                  </td>
                  <td className="max-w-[260px] px-3 py-2.5">
                    <ul className="space-y-1">
                      {[
                        { id: s.user.id as string | null, name: s.user.name, email: s.user.email as string | null, avatarVersion: s.user.avatarUpdatedAt?.getTime() ?? null, role: "owner", state: "" },
                        // a co-author an administrator credited has no account: name only, no link, no e-mail
                        ...s.collaborators.map((c) => ({
                          id: (c.user?.id ?? null) as string | null,
                          name: c.user?.name ?? c.name ?? "Unnamed co-author",
                          email: (c.user?.email ?? null) as string | null,
                          avatarVersion: c.user?.avatarUpdatedAt?.getTime() ?? null,
                          role: "co-author",
                          state: c.user ? (c.acceptedAt ? "" : c.notifiedAt ? "invited" : "pending") : "no account",
                        })),
                      ].map((u, i) => (
                        <li key={u.id ?? `x${i}`} className="flex items-center gap-2">
                          <Avatar userId={u.id ?? ""} name={u.name} hasAvatar={u.avatarVersion !== null} version={u.avatarVersion} size={26} className={u.state ? "opacity-60" : undefined} />
                          <span className="min-w-0">
                            {u.id ? (
                              <Link href={`/users/${u.id}`} className="block truncate text-grey-900 hover:text-maroon hover:underline">
                                {u.name}
                                {u.role === "co-author" ? <span className="ml-1 text-[10px] font-heading font-semibold uppercase tracking-wide text-grey-500">{u.state || "co-author"}</span> : null}
                              </Link>
                            ) : (
                              <span className="block truncate text-grey-900">
                                {u.name}
                                <span className="ml-1 text-[10px] font-heading font-semibold uppercase tracking-wide text-grey-500">{u.state}</span>
                              </span>
                            )}
                            <span className="block truncate text-xs text-grey-600" title={u.email ?? undefined}>{u.email ?? (c_affil(s, u.name) || "credited by an administrator")}</span>
                          </span>
                        </li>
                      ))}
                    </ul>
                    <EditAuthorship
                      id={s.id}
                      seq={s.seq}
                      modelName={s.modelName}
                      owner={{ id: s.user.id, name: s.user.name, email: s.user.email, avatarVersion: s.user.avatarUpdatedAt?.getTime() ?? null }}
                      coAuthors={s.collaborators.map((c) => ({ id: c.user?.id ?? null, name: c.user?.name ?? c.name ?? "Unnamed co-author", email: c.user?.email ?? "", affiliation: c.affiliation ?? undefined, avatarVersion: c.user?.avatarUpdatedAt?.getTime() ?? null }))}
                    />
                  </td>
                  <td className="px-3 py-2.5"><StatusBadge status={s.status} /></td>
                  <td className="px-3 py-2.5 tabular">{s.result ? fmtPct(s.result.weightedError) : "—"}</td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-grey-700" title={fmtDateTime(s.submittedAt)}>{fmtDate(s.submittedAt)}</td>
                  <td className="px-3 py-2.5"><ModerateButtons id={s.id} isPrivate={s.isPrivate} isHidden={s.isHidden} status={s.status} compact /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <BulkBar />
      </BulkProvider>
    </div>
  );
}
