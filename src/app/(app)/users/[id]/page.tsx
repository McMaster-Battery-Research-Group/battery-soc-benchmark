import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { publicAuthors, AUTHOR_USER_SELECT, AUTHOR_COLLABORATORS } from "@/lib/authors";
import { Globe, BookOpen, Briefcase, Building2, CalendarDays, Trophy, Pencil, Shield, Users } from "lucide-react";
import { GitHubIcon, OrcidIcon, LinkedInIcon, ResearchGateIcon, GoogleScholarIcon } from "@/components/brand-icons";
import { personByEmail } from "@/lib/people";
import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
import { fmtDate, fmtPct } from "@/lib/utils";
import { MODEL_TYPE_LABELS } from "@/lib/test-cases";
import { Avatar } from "@/components/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/misc";

export const dynamic = "force-dynamic";

const select = {
  id: true, name: true, email: true, affiliation: true, role: true, createdAt: true,
  occupation: true, bio: true, website: true, linkedin: true, orcid: true, googleScholar: true, researchGate: true, github: true, avatarUpdatedAt: true,
} as const;

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const u = await db.user.findUnique({ where: { id: (await params).id }, select: { name: true } });
  return { title: u ? u.name : "Researcher" };
}

/** Public researcher page: profile details plus every public, completed submission. */
export default async function UserPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [session, user] = await Promise.all([auth(), db.user.findUnique({ where: { id }, select })]);
  if (!user) notFound();
  const isSelf = session?.user?.id === user.id;
  const team = personByEmail(user.email); // benchmark team entry (src/lib/people.ts), if any
  const isAdmin = session?.user?.role === "ADMIN";
  const subs = await db.submission.findMany({
    where: { OR: [{ userId: user.id }, { collaborators: { some: { userId: user.id, ...(isSelf || isAdmin ? {} : { acceptedAt: { not: null } }) } } }], status: "COMPLETED", result: { isNot: null }, ...(isSelf || isAdmin ? {} : { isPrivate: false, isHidden: false }) },
    omit: { creditAvatar: true },
    include: { result: { select: { weightedError: true, allCells: true } }, contest: { select: { title: true } }, user: { select: AUTHOR_USER_SELECT }, collaborators: AUTHOR_COLLABORATORS },
    orderBy: { submittedAt: "desc" },
  }).then((rows) =>
    rows
      // an uploader who is not shown as an author (submitted on someone's behalf) is not credited on their profile either
      .map((s) => ({ ...s, authors: publicAuthors(s), shown: publicAuthors(s).some((a) => a.id === user.id) }))
      .filter((s) => s.shown || isSelf || isAdmin),
  );

  const links = [
    user.orcid ? { icon: OrcidIcon, label: "ORCID", text: user.orcid, href: `https://orcid.org/${user.orcid}` } : null,
    user.googleScholar ? { icon: GoogleScholarIcon, label: "Google Scholar", text: "Profile", href: user.googleScholar } : null,
    user.researchGate ? { icon: ResearchGateIcon, label: "ResearchGate", text: "Profile", href: user.researchGate } : null,
    user.linkedin ? { icon: LinkedInIcon, label: "LinkedIn", text: "Profile", href: user.linkedin } : null,
    user.github ? { icon: GitHubIcon, label: "GitHub", text: user.github.replace(/^https?:\/\/(www\.)?github\.com\//, ""), href: user.github } : null,
    user.website ? { icon: Globe, label: "Website", text: user.website.replace(/^https?:\/\//, ""), href: user.website } : null,
  ].filter(Boolean) as { icon: React.ComponentType<{ className?: string }>; label: string; text: string; href: string }[];
  for (const l of team?.links ?? []) if (!links.some((x) => x.href === l.href)) links.push({ icon: BookOpen, label: l.label, text: l.label, href: l.href });

  return (
    <div className="container-site py-8">
      <div className="card p-6 md:p-8">
        <div className="flex flex-col gap-5 md:flex-row md:items-start">
          <Avatar userId={user.id} name={user.name} hasAvatar={!!user.avatarUpdatedAt} version={user.avatarUpdatedAt?.getTime() ?? null} size={112} className="ring-4 ring-grey-100" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-heading text-3xl font-bold">{user.name}</h1>
              {user.role === "ADMIN" ? <Badge variant="maroon"><Shield className="size-3" /> Administrator</Badge> : null}
              {team ? <Badge variant={team.group === "current" ? "gold" : "neutral"}><Users className="size-3" /> {team.group === "current" ? "Benchmark team" : "Past contributor"}</Badge> : null}
            </div>
            <ul className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm text-grey-700">
              {user.occupation ? <li className="inline-flex items-center gap-1.5"><Briefcase className="size-4 text-grey-500" /> {user.occupation}</li> : team ? <li className="inline-flex items-center gap-1.5"><Briefcase className="size-4 text-grey-500" /> {team.role}</li> : null}
              <li className="inline-flex items-center gap-1.5"><Building2 className="size-4 text-grey-500" /> {user.affiliation}</li>
              <li className="inline-flex items-center gap-1.5"><CalendarDays className="size-4 text-grey-500" /> Member since {fmtDate(user.createdAt)}</li>
            </ul>
            {user.bio ? <p className="mt-4 max-w-3xl whitespace-pre-line text-[15px] leading-relaxed text-grey-800">{user.bio}</p> : null}
            {links.length ? (
              <ul className="mt-4 flex flex-wrap gap-2">
                {links.map((l) => (
                  <li key={l.label}>
                    <a href={l.href} target="_blank" rel="noopener noreferrer me" className="inline-flex items-center gap-1.5 rounded-brand border border-border px-2.5 py-1 text-sm text-grey-900 hover:border-maroon hover:text-maroon">
                      <l.icon className="size-4" /> <span className="font-heading font-medium">{l.label}</span>{l.text !== "Profile" ? <span className="text-grey-600">· {l.text}</span> : null}
                    </a>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
          {isSelf ? <Button asChild variant="secondary" size="sm"><Link href="/profile"><Pencil /> Edit profile</Link></Button> : null}
        </div>
      </div>

      <h2 className="mt-8 font-heading text-xl font-semibold">Submissions <span className="text-grey-500">({subs.length})</span></h2>
      {subs.length ? (
        <div className="mt-3 overflow-x-auto rounded-brand border border-border">
          <table className="w-full min-w-[560px] text-sm">
            <thead className="bg-grey-100 text-left font-heading text-xs uppercase tracking-wide text-grey-700">
              <tr><th className="px-3 py-2">Model</th><th className="px-3 py-2">Type</th><th className="px-3 py-2 text-right">Weighted error</th><th className="px-3 py-2 text-right">All cells</th><th className="px-3 py-2">Submitted</th></tr>
            </thead>
            <tbody>
              {subs.map((s) => (
                <tr key={s.id} className="border-t border-border">
                  <td className="px-3 py-2">
                    <Link href={`/submissions/${s.id}`} className="font-heading font-medium text-ink hover:text-maroon hover:underline">{s.modelName}</Link>
                    {s.contest ? <Badge variant="gold" className="ml-2"><Trophy className="size-3" /> {s.contest.title}</Badge> : null}
                    {s.isPrivate ? <Badge variant="neutral" className="ml-2">Private</Badge> : null}
                    {!s.shown ? <span className="ml-2 text-xs text-grey-600">not shown as an author; credited to {s.authors.map((a) => a.name).join(", ")}</span> : s.authors.length > 1 ? <span className="ml-2 text-xs text-grey-600">with {s.authors.filter((a) => a.id !== user.id).map((a) => a.name).join(", ")}</span> : null}
                  </td>
                  <td className="px-3 py-2 text-grey-700">{MODEL_TYPE_LABELS[s.modelType] ?? s.modelType}</td>
                  <td className="px-3 py-2 text-right font-heading font-semibold tabular">{fmtPct(s.result!.weightedError)} %</td>
                  <td className="px-3 py-2 text-right tabular">{fmtPct(s.result!.allCells)} %</td>
                  <td className="px-3 py-2 whitespace-nowrap text-grey-700">{fmtDate(s.submittedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="mt-3"><EmptyState title="No public submissions yet" description={isSelf ? "Results of your public submissions will be listed here." : "This researcher has not published any evaluated models yet."} /></div>
      )}
    </div>
  );
}
