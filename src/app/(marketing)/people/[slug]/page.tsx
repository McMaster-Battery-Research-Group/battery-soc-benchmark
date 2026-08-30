import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, ExternalLink, Users } from "lucide-react";
import { db } from "@/lib/db";
import { PEOPLE, personBySlug, initialsOf } from "@/lib/people";
import { Badge } from "@/components/ui/badge";

export const dynamic = "force-dynamic";

export function generateStaticParams() {
  return PEOPLE.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const p = personBySlug((await params).slug);
  return { title: p ? p.name : "Team member" };
}

/**
 * One page per team member. If the person has a site account (matched by e-mail), this
 * redirects to their researcher profile, which also shows their submissions; otherwise a
 * static profile is rendered from src/lib/people.ts.
 */
export default async function PersonPage({ params }: { params: Promise<{ slug: string }> }) {
  const p = personBySlug((await params).slug);
  if (!p) notFound();
  if (p.email) {
    const account = await db.user.findUnique({ where: { email: p.email }, select: { id: true } });
    if (account) redirect(`/users/${account.id}`);
  }
  return (
    <div className="container-site py-8">
      <Link href="/about#people" className="inline-flex items-center gap-1 text-sm text-maroon hover:underline"><ArrowLeft className="size-4" /> About the project</Link>
      <div className="card mt-4 p-6 md:p-8">
        <div className="flex flex-col gap-5 md:flex-row md:items-start">
          {p.photo ? (
            <Image src={p.photo} alt={p.name} width={112} height={112} className="size-28 shrink-0 rounded-brand object-cover ring-4 ring-grey-100" />
          ) : (
            <span aria-hidden className="flex size-28 shrink-0 items-center justify-center rounded-brand bg-maroon-100 font-heading text-3xl font-semibold text-maroon">{initialsOf(p.name)}</span>
          )}
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-heading text-3xl font-bold">{p.name}</h1>
              <Badge variant={p.group === "current" ? "maroon" : "neutral"}><Users className="size-3" /> {p.group === "current" ? "Benchmark team" : "Past contributor"}</Badge>
            </div>
            <p className="mt-2 text-grey-800">{p.role}</p>
            <p className="mt-1 text-sm text-grey-600">McMaster University · Dr. Kollmeyer&apos;s battery research group</p>
            {p.links?.length ? (
              <>
                <h2 className="mt-6 font-heading text-sm font-semibold uppercase tracking-wide text-grey-600">Publications &amp; profiles</h2>
                <ul className="mt-2 space-y-1.5">
                  {p.links.map((l) => (
                    <li key={l.href}>
                      <a href={l.href} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-maroon underline">{l.label} <ExternalLink className="size-3.5" /></a>
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
            <p className="mt-6 text-xs text-grey-600">This person does not have a benchmark account yet. If they register with their McMaster e-mail, this page becomes their full researcher profile with their submissions.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
