"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X, ChevronDown, LogOut, User as UserIcon, Shield, FolderKanban } from "lucide-react";
import { cn, initials } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Wordmark } from "./logo";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger, DropdownMenuLabel } from "@/components/ui/dropdown";
import { signOutAction } from "@/app/(auth)/actions";

type HeaderUser = { id: string; name: string; email?: string | null; role: "USER" | "ADMIN"; affiliation: string } | null;

const NAV = [
  { href: "/getting-started", label: "Get started" },
  { href: "/leaderboard", label: "Leaderboard" },
  { href: "/compare", label: "Compare" },
  { href: "/contest", label: "Contest" },
  { href: "/dataset", label: "Dataset" },
  { href: "/docs", label: "Methodology" },
  { href: "/examples", label: "Examples" },
];

export function SiteHeader({ user }: { user: HeaderUser }) {
  const pathname = usePathname();
  const [open, setOpen] = React.useState(false);
  React.useEffect(() => setOpen(false), [pathname]);

  const isActive = (href: string) => pathname === href || pathname.startsWith(href + "/");

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/85">
      <div className="h-1 w-full bg-maroon" aria-hidden />
      <div className="container-site flex h-16 items-center justify-between gap-6">
        <div className="flex items-center gap-8">
          <Wordmark />
          <nav className="hidden items-center gap-1 lg:flex" aria-label="Primary">
            {NAV.map((n) => (
              <Link
                key={n.href}
                href={n.href}
                className={cn(
                  "rounded-brand px-3 py-2 font-heading text-[15px] font-medium transition-colors",
                  isActive(n.href) ? "bg-maroon-100 text-maroon" : "text-grey-800 hover:bg-grey-100 hover:text-ink",
                )}
                aria-current={isActive(n.href) ? "page" : undefined}
              >
                {n.label}
              </Link>
            ))}
          </nav>
        </div>

        <div className="hidden items-center gap-2 lg:flex">
          {user ? (
            <>
              <Button asChild variant="primary" size="sm">
                <Link href="/submit">Submit a model</Link>
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger className="ml-1 flex items-center gap-2 rounded-brand px-2 py-1.5 hover:bg-grey-100">
                  <span className="flex size-8 items-center justify-center rounded-full bg-maroon font-heading text-xs font-semibold text-white">{initials(user.name)}</span>
                  <span className="max-w-32 truncate font-heading text-sm font-medium text-ink">{user.name}</span>
                  <ChevronDown className="size-4 text-grey-600" />
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  <DropdownMenuLabel>{user.affiliation}</DropdownMenuLabel>
                  <DropdownMenuItem asChild><Link href="/submissions"><FolderKanban className="size-4" /> My submissions</Link></DropdownMenuItem>
                  <DropdownMenuItem asChild><Link href="/profile"><UserIcon className="size-4" /> Profile</Link></DropdownMenuItem>
                  {user.role === "ADMIN" ? <DropdownMenuItem asChild><Link href="/admin"><Shield className="size-4" /> Admin</Link></DropdownMenuItem> : null}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={() => signOutAction()}><LogOut className="size-4" /> Sign out</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          ) : (
            <>
              <Button asChild variant="ghost" size="sm"><Link href="/login">Sign in</Link></Button>
              <Button asChild variant="primary" size="sm"><Link href="/register">Create account</Link></Button>
            </>
          )}
        </div>

        <button className="rounded-brand p-2 text-grey-800 hover:bg-grey-100 lg:hidden" onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-controls="mobile-nav" aria-label="Toggle navigation">
          {open ? <X className="size-6" /> : <Menu className="size-6" />}
        </button>
      </div>

      {open ? (
        <div id="mobile-nav" className="border-t border-border bg-white lg:hidden">
          <nav className="container-site flex flex-col py-3" aria-label="Mobile">
            {NAV.map((n) => (
              <Link key={n.href} href={n.href} className={cn("rounded-brand px-3 py-3 font-heading text-base font-medium", isActive(n.href) ? "bg-maroon-100 text-maroon" : "text-grey-900")}>{n.label}</Link>
            ))}
            <div className="my-2 h-px bg-border" />
            {user ? (
              <>
                <Link href="/submit" className="rounded-brand px-3 py-3 font-heading font-medium text-maroon">Submit a model</Link>
                <Link href="/submissions" className="rounded-brand px-3 py-3 font-heading font-medium text-grey-900">My submissions</Link>
                <Link href="/profile" className="rounded-brand px-3 py-3 font-heading font-medium text-grey-900">Profile</Link>
                {user.role === "ADMIN" ? <Link href="/admin" className="rounded-brand px-3 py-3 font-heading font-medium text-grey-900">Admin</Link> : null}
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
