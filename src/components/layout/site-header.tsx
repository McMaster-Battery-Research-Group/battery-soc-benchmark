"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X, ChevronDown, LogOut, User as UserIcon, Shield, FolderKanban, MessageSquare, BookOpen, FlaskConical, Database, ListChecks, BookA, LifeBuoy, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/avatar";
import { Wordmark } from "./logo";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger, DropdownMenuLabel } from "@/components/ui/dropdown";
import { signOutAction } from "@/app/(auth)/actions";

type HeaderUser = { id: string; name: string; email?: string | null; role: "USER" | "ADMIN"; affiliation: string } | null;

/** Four destinations + one "Learn" group. */
const NAV = [
  { href: "/leaderboard", label: "Leaderboard", match: ["/leaderboard", "/submissions/"] },
  { href: "/compare", label: "Compare", match: ["/compare"] },
  { href: "/contest", label: "Contest", match: ["/contest"] },
];

export const LEARN = [
  { href: "/getting-started", label: "Get started", desc: "From zero to a first score, step by step", icon: BookOpen },
  { href: "/examples", label: "Example models", desc: "Four reference estimators in MATLAB and Python", icon: FlaskConical },
  { href: "/dataset", label: "Dataset", desc: "What is open, what is blinded, how to download", icon: Database },
  { href: "/docs", label: "Methodology", desc: "Test cases, weights, submission format", icon: ListChecks },
  { href: "/glossary", label: "Glossary", desc: "Every term in plain language", icon: BookA },
  { href: "/help", label: "Help & FAQ", desc: "Accounts, submissions, results", icon: LifeBuoy },
  { href: "/about", label: "About the project", desc: "The lab, the people, the funding", icon: Info },
];

export function SiteHeader({ user }: { user: HeaderUser }) {
  const pathname = usePathname();
  const [open, setOpen] = React.useState(false);
  React.useEffect(() => setOpen(false), [pathname]);

  const active = (m: string[]) => m.some((p) => pathname === p || pathname.startsWith(p.endsWith("/") ? p : p + "/"));
  const learnActive = LEARN.some((l) => pathname === l.href || pathname.startsWith(l.href + "/"));
  const item = (isActive: boolean) =>
    cn("rounded-brand px-3 py-2 font-heading text-[15px] font-medium transition-colors", isActive ? "bg-maroon-100 text-maroon" : "text-grey-800 hover:bg-grey-100 hover:text-ink");

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/85">
      <div className="h-1 w-full bg-maroon" aria-hidden />
      <div className="container-site flex h-16 items-center justify-between gap-6">
        <div className="flex items-center gap-8">
          <Wordmark />
          <nav className="hidden items-center gap-1 lg:flex" aria-label="Primary">
            {NAV.map((n) => (
              <Link key={n.href} href={n.href} className={item(active(n.match))} aria-current={active(n.match) ? "page" : undefined}>
                {n.label}
              </Link>
            ))}
            <DropdownMenu>
              <DropdownMenuTrigger className={cn(item(learnActive), "inline-flex items-center gap-1")}>
                Learn <ChevronDown className="size-4 text-grey-600" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-80 p-2">
                {LEARN.map((l) => (
                  <DropdownMenuItem key={l.href} asChild className="items-start gap-3 py-2.5">
                    <Link href={l.href}>
                      <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-brand bg-maroon-100 text-maroon"><l.icon className="size-4" /></span>
                      <span>
                        <span className="block font-heading font-medium text-ink">{l.label}</span>
                        <span className="block text-xs text-grey-600">{l.desc}</span>
                      </span>
                    </Link>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </nav>
        </div>

        <div className="hidden items-center gap-2 lg:flex">
          <Button asChild variant="primary" size="sm">
            <Link href="/submit">Submit a model</Link>
          </Button>
          {user ? (
            <DropdownMenu>
              <DropdownMenuTrigger className="ml-1 flex items-center gap-2 rounded-brand px-2 py-1.5 hover:bg-grey-100">
                <Avatar userId={user.id} name={user.name} size={32} />
                <span className="max-w-32 truncate font-heading text-sm font-medium text-ink">{user.name}</span>
                {user.role === "ADMIN" ? <span className="rounded-[3px] bg-maroon px-1.5 py-0.5 font-heading text-[10px] font-semibold uppercase tracking-wide text-white" title="Administrator">Admin</span> : null}
                <ChevronDown className="size-4 text-grey-600" />
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuLabel>{user.affiliation}</DropdownMenuLabel>
                <DropdownMenuItem asChild><Link href="/submissions"><FolderKanban className="size-4" /> My submissions</Link></DropdownMenuItem>
                <DropdownMenuItem asChild><Link href="/profile"><UserIcon className="size-4" /> Profile</Link></DropdownMenuItem>
                {user.role === "ADMIN" ? <DropdownMenuItem asChild><Link href="/admin"><Shield className="size-4" /> Admin</Link></DropdownMenuItem> : null}
                <DropdownMenuItem asChild><Link href="/contact"><MessageSquare className="size-4" /> Feedback &amp; support</Link></DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => signOutAction()}><LogOut className="size-4" /> Sign out</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <Button asChild variant="ghost" size="sm"><Link href="/login">Sign in</Link></Button>
          )}
        </div>

        <button className="rounded-brand p-2 text-grey-800 hover:bg-grey-100 lg:hidden" onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-controls="mobile-nav" aria-label="Toggle navigation">
          {open ? <X className="size-6" /> : <Menu className="size-6" />}
        </button>
      </div>

      {open ? (
        <div id="mobile-nav" className="max-h-[calc(100dvh-4rem)] overflow-y-auto overscroll-contain border-t border-border bg-white lg:hidden">
          <nav className="container-site flex flex-col py-3" aria-label="Mobile">
            {user ? (
              <>
                <div className="flex items-center gap-3 px-3 pb-2 pt-1">
                  <Avatar userId={user.id} name={user.name} size={36} />
                  <div className="min-w-0">
                    <p className="truncate font-heading font-semibold text-ink">{user.name}</p>
                    <p className="truncate text-xs text-grey-600">{user.affiliation}</p>
                  </div>
                  {user.role === "ADMIN" ? <span className="ml-auto rounded-[3px] bg-maroon px-1.5 py-0.5 font-heading text-[10px] font-semibold uppercase tracking-wide text-white">Admin</span> : null}
                </div>
                {user.role === "ADMIN" ? <Link href="/admin" className="flex items-center gap-2 rounded-brand bg-maroon-100 px-3 py-3 font-heading font-medium text-maroon"><Shield className="size-4" /> Admin panel</Link> : null}
                <Link href="/submissions" className="rounded-brand px-3 py-3 font-heading font-medium text-grey-900">My submissions</Link>
                <Link href="/profile" className="rounded-brand px-3 py-3 font-heading font-medium text-grey-900">Profile</Link>
                <div className="my-2 h-px bg-border" />
              </>
            ) : null}
            {NAV.map((n) => (
              <Link key={n.href} href={n.href} className={cn("rounded-brand px-3 py-3 font-heading text-base font-medium", active(n.match) ? "bg-maroon-100 text-maroon" : "text-grey-900")}>{n.label}</Link>
            ))}
            <Link href="/submit" className="rounded-brand px-3 py-3 font-heading text-base font-medium text-maroon">Submit a model</Link>
            <p className="mt-2 px-3 pb-1 pt-2 font-heading text-xs font-semibold uppercase tracking-wide text-grey-600">Learn</p>
            {LEARN.map((l) => (
              <Link key={l.href} href={l.href} className="rounded-brand px-3 py-2.5 font-heading text-[15px] font-medium text-grey-900">{l.label}</Link>
            ))}
            <div className="my-2 h-px bg-border" />
            {user ? (
              <>
                <Link href="/contact" className="rounded-brand px-3 py-3 font-heading font-medium text-grey-900">Feedback &amp; support</Link>
                <button onClick={() => signOutAction()} className="rounded-brand px-3 py-3 text-left font-heading font-medium text-grey-900">Sign out</button>
              </>
            ) : (
              <div className="flex gap-2 px-3 py-2">
                <Button asChild variant="secondary" className="flex-1"><Link href="/login">Sign in</Link></Button>
                <Button asChild className="flex-1"><Link href="/register">Create account</Link></Button>
              </div>
            )}
          </nav>
        </div>
      ) : null}
    </header>
  );
}
