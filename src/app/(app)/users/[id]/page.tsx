import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Globe, GraduationCap, BookOpen, Briefcase, Building2, CalendarDays, Trophy, Pencil, Shield, Users } from "lucide-react";
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
    include: { result: { select: { weightedError: true, allCells: true } }, contest: { select: { title: true } }, user: { select: { name: true } } },
    orderBy: { submittedAt: "desc" },
  });

  const links = [
    user.orcid ? { icon: OrcidIcon, label: "ORCID", text: user.orcid, href: `https://orcid.org/${user.orcid}` } : null,
    user.googleScholar ? { icon: GraduationCap, label: "Google Scholar", text: "Profile", href: user.googleScholar } : null,
    user.researchGate ? { icon: BookOpen, label: "ResearchGate", text: "Profile", href: user.researchGate } : null,
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
                    {s.userId !== user.id ? <span className="ml-2 text-xs text-grey-600">with {s.user.name}</span> : null}
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

function LinkedInIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden fill="currentColor">
      <path d="M20.45 20.45h-3.55v-5.57c0-1.33-.03-3.04-1.85-3.04-1.85 0-2.14 1.45-2.14 2.94v5.67H9.36V9h3.41v1.56h.05c.47-.9 1.63-1.85 3.36-1.85 3.6 0 4.27 2.37 4.27 5.45v6.29zM5.34 7.43a2.06 2.06 0 1 1 0-4.12 2.06 2.06 0 0 1 0 4.12zM7.12 20.45H3.56V9h3.56v11.45zM22.22 0H1.77C.79 0 0 .77 0 1.73v20.54C0 23.23.79 24 1.77 24h20.45c.98 0 1.78-.77 1.78-1.73V1.73C24 .77 23.2 0 22.22 0z" />
    </svg>
  );
}

function GitHubIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden fill="currentColor">
      <path d="M12 .3a12 12 0 0 0-3.8 23.4c.6.1.8-.3.8-.6v-2c-3.3.7-4-1.6-4-1.6-.6-1.4-1.4-1.8-1.4-1.8-1.1-.7.1-.7.1-.7 1.2.1 1.8 1.2 1.8 1.2 1.1 1.8 2.8 1.3 3.5 1 .1-.8.4-1.3.8-1.6-2.7-.3-5.5-1.3-5.5-5.9 0-1.3.5-2.4 1.2-3.2-.1-.3-.5-1.5.1-3.2 0 0 1-.3 3.3 1.2a11.5 11.5 0 0 1 6 0C17.3 4.7 18.3 5 18.3 5c.7 1.7.3 2.9.1 3.2.8.8 1.2 1.9 1.2 3.2 0 4.6-2.8 5.6-5.5 5.9.4.4.8 1.1.8 2.2v3.3c0 .3.2.7.8.6A12 12 0 0 0 12 .3z" />
    </svg>
  );
}

function OrcidIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 256 256" className={className} aria-hidden fill="currentColor">
      <path d="M128 0C57.3 0 0 57.3 0 128s57.3 128 128 128 128-57.3 128-128S198.7 0 128 0zM86.3 186.2H70.9V79.1h15.4v107.1zm-7.7-118.8c-5.5 0-10-4.5-10-10s4.5-10 10-10 10 4.5 10 10-4.5 10-10 10zm93.9 118.8h-41.2V79.1h41.2c37.9 0 55.3 27.1 55.3 53.5 0 27.5-21.5 53.6-55.3 53.6zm-1.9-93.2h-23.9v79.3h24.3c31.3 0 39.7-23.5 39.7-39.6 0-21.5-13.7-39.7-40.1-39.7z" />
    </svg>
  );
}
