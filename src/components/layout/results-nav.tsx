"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Trophy, GitCompareArrows, ListOrdered } from "lucide-react";
import { cn } from "@/lib/utils";

/** Sub-navigation shared by the results area: Leaderboard · Compare · Contest. */
export function ResultsNav() {
  const p = usePathname();
  const items = [
    { href: "/leaderboard", label: "Leaderboard", icon: ListOrdered, active: p === "/leaderboard" },
    { href: "/compare", label: "Compare models", icon: GitCompareArrows, active: p.startsWith("/compare") },
    { href: "/contest", label: "Contest", icon: Trophy, active: p.startsWith("/contest") },
  ];
  return (
    <nav className="border-b border-border bg-white" aria-label="Results">
      <div className="container-site flex gap-1 overflow-x-auto">
        {items.map((i) => (
          <Link
            key={i.href}
            href={i.href}
            aria-current={i.active ? "page" : undefined}
            className={cn("-mb-px inline-flex items-center gap-2 whitespace-nowrap border-b-2 px-3 py-3 font-heading text-sm font-medium transition-colors", i.active ? "border-maroon text-maroon" : "border-transparent text-grey-700 hover:text-ink")}
          >
            <i.icon className="size-4" /> {i.label}
          </Link>
        ))}
      </div>
    </nav>
  );
}
