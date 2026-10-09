import Link from "next/link";
import { db } from "@/lib/db";
import { fmtDate, fmtDateTime, fmtPct } from "@/lib/utils";
import { StatusBadge, Badge } from "@/components/ui/badge";
import { NativeSelect } from "@/components/ui/input";
import { CURRENT_EVALUATOR_VERSION, isCurrentBenchmark } from "@/lib/benchmark-version";
import { ModerateButtons } from "./moderate";
import { EditAuthorship } from "./authorship";
import { publicAuthors, guestAvatar } from "@/lib/authors";
import { RunningProgress } from "./running-progress";
import { LegacyEntryDialog } from "./legacy-entry";
import { AutoRefresh } from "../workers/controls";
import { BulkProvider, RowCheck, HeaderCheck, BulkBar } from "./bulk-delete";
import { Avatar } from "@/components/avatar";

export const dynamic = "force-dynamic";

/** Affiliation recorded for an administrator-entered credit, if any. */
export default async function AdminSubmissions({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const { status } = await searchParams;
  const subs = await db.submission.findMany({
    where: status ? { status: status as "QUEUED" | "RUNNING" | "COMPLETED" | "FAILED" } : {},
    orderBy: { submittedAt: "desc" },
    take: 200,
    omit: { creditAvatar: true },
    include: {
      user: { select: { id: true, name: true, email: true, affiliation: true, avatarUpdatedAt: true } },
      collaborators: { select: { id: true, userId: true, name: true, affiliation: true, avatarAt: true, notifiedAt: true, acceptedAt: true, user: { select: { id: true, name: true, email: true, affiliation: true, avatarUpdatedAt: true } } }, orderBy: { addedAt: "asc" } },
      result: { select: { weightedError: true, evaluatorVersion: true } },
      job: { select: { log: true } },
      contest: { select: { title: true } },
    },
  });
  return (
    <div>
      {/* the table is a server component; re-fetch while evaluations are in flight so the bars move */}
      {subs.some((s) => s.status === "RUNNING") ? <AutoRefresh seconds={10} /> : null}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-bold">Submissions</h1>
          <p className="mt-1 text-sm text-grey-700">{subs.length} shown{status ? ` · ${status}` : ""}. Moderation actions ask for a reason and e-mail the author and accepted collaborators.</p>
        </div>
        <form className="flex items-center gap-2 text-sm">
          <LegacyEntryDialog />
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
                  <td className="px-3 py-2.5"><RowCheck id={s.id} disabled={s.status === "RUNNING"} title={s.status === "RUNNING" ? "Running; cancel the evaluation first" : undefined} /></td>
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
                  <td className="max-w-[280px] px-3 py-2.5">
                    {(() => {
                      // public authors in display order, then whoever is attached but not shown
                      const pub = publicAuthors(s);
                      const ownerShown = pub.some((a) => a.id === s.user.id);
                      const rows = [
                        ...pub.map((a, i) => ({
                          key: a.id ?? `g${i}`, id: a.id, name: a.name, avatarVersion: a.avatarVersion, avatarSrc: a.avatarSrc,
                          sub: a.id === s.user.id ? s.user.email : a.id ? (s.collaborators.find((c) => c.userId === a.id)?.user?.email ?? "") : a.affiliation || "no account",
                          tags: [i === 0 ? "lead author" : "co-author", ...(a.id === s.user.id ? ["manages"] : [])], dim: false,
                        })),
                        ...(!ownerShown ? [{ key: "owner", id: s.user.id as string | null, name: s.user.name, avatarVersion: s.user.avatarUpdatedAt?.getTime() ?? null, avatarSrc: null as string | null, sub: s.user.email, tags: ["manages", "not shown"], dim: true }] : []),
                        ...s.collaborators.filter((c) => c.user && !c.acceptedAt).map((c) => ({ key: c.id, id: c.user!.id as string | null, name: c.user!.name, avatarVersion: c.user!.avatarUpdatedAt?.getTime() ?? null, avatarSrc: null as string | null, sub: c.user!.email, tags: ["co-author", c.notifiedAt ? "invited" : "pending"], dim: true })),
                      ];
                      const tagClass = (t: string) => t === "lead author" ? "bg-maroon-100 text-maroon" : t === "manages" ? "bg-gold-100 text-[#7a4f0e]" : "bg-grey-100 text-grey-600";
                      return (
                        <ul className="space-y-1.5">
                          {rows.map((u) => (
                            <li key={u.key} className={`flex items-center gap-2 ${u.dim ? "opacity-70" : ""}`}>
                              <Avatar userId={u.id ?? ""} name={u.name} hasAvatar={u.avatarVersion !== null} version={u.avatarVersion} src={u.avatarSrc} size={26} />
                              <span className="min-w-0">
                                <span className="flex flex-wrap items-center gap-1">
                                  {u.id ? <Link href={`/users/${u.id}`} className="truncate text-grey-900 hover:text-maroon hover:underline">{u.name}</Link> : <span className="truncate text-grey-900">{u.name}</span>}
                                  {u.tags.map((t) => <span key={t} className={`rounded-[3px] px-1 py-px font-heading text-[0.5625rem] font-semibold uppercase tracking-wide ${tagClass(t)}`}>{t}</span>)}
                                </span>
                                <span className="block truncate text-xs text-grey-600">{u.sub}</span>
                              </span>
                            </li>
                          ))}
                        </ul>
                      );
                    })()}
                    <EditAuthorship
                      id={s.id}
                      seq={s.seq}
                      modelName={s.modelName}
                      owner={{ id: s.user.id, name: s.user.name, email: s.user.email, affiliation: s.user.affiliation, avatarVersion: s.user.avatarUpdatedAt?.getTime() ?? null }}
                      credit={{ name: s.creditName, affiliation: s.creditAffiliation, avatarSrc: guestAvatar(s.id, "credit", s.creditAvatarAt, s.creditName ?? "") }}
                      ownerDisplay={s.ownerDisplay}
                      coAuthors={s.collaborators.map((c) => ({ id: c.user?.id ?? null, rowId: c.id, name: c.user?.name ?? c.name ?? "Unnamed co-author", email: c.user?.email ?? "", affiliation: c.user?.affiliation ?? c.affiliation ?? undefined, avatarVersion: c.user?.avatarUpdatedAt?.getTime() ?? null, avatarSrc: c.user ? null : guestAvatar(s.id, c.id, c.avatarAt, c.name ?? "") }))}
                    />
                  </td>
                  <td className="px-3 py-2.5">
                    <StatusBadge status={s.status} />
                    {s.status === "RUNNING" ? <RunningProgress log={s.job?.log ?? ""} /> : null}
                  </td>
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
