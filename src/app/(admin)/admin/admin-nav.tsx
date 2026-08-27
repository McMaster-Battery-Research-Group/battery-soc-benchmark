"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, FolderKanban, Trophy, Users, Inbox, Server, Scale } from "lucide-react";
import { cn } from "@/lib/utils";

const ITEMS = [
  { href: "/admin", label: "Overview", icon: LayoutDashboard },
  { href: "/admin/submissions", label: "Submissions", icon: FolderKanban },
  { href: "/admin/contests", label: "Contests", icon: Trophy },
  { href: "/admin/users", label: "Users", icon: Users },
  { href: "/admin/messages", label: "Messages", icon: Inbox },
  { href: "/admin/workers", label: "Evaluation workers", icon: Server },
  { href: "/admin/scoring", label: "Scoring weights", icon: Scale },
];

export function AdminNav() {
  const p = usePathname();
  return (
    <nav className="flex gap-1 overflow-x-auto lg:flex-col" aria-label="Admin">
      {ITEMS.map((i) => {
        const active = i.href === "/admin" ? p === "/admin" : p.startsWith(i.href);
        return (
          <Link key={i.href} href={i.href} className={cn("flex items-center gap-2 whitespace-nowrap rounded-brand px-3 py-2 font-heading text-sm font-medium", active ? "bg-maroon-100 text-maroon" : "text-grey-800 hover:bg-grey-100")} aria-current={active ? "page" : undefined}>
            <i.icon className="size-4" /> {i.label}
          </Link>
        );
      })}
    </nav>
  );
}
