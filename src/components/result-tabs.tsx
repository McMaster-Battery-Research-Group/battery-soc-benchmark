"use client";

import * as React from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

export type ResultTab = { id: string; label: string; icon: React.ReactNode; count?: string; content: React.ReactNode };

/**
 * The sections of a results page as tabs, so the page is one screen deep instead of a long scroll.
 * The open tab is kept in the URL hash (#scorecard, #key-cases, …) so links to a section still work.
 */
export function ResultTabs({ tabs, className }: { tabs: ResultTab[]; className?: string }) {
  const [value, setValue] = React.useState(tabs[0].id);
  React.useEffect(() => {
    const fromHash = () => {
      const h = window.location.hash.slice(1);
      if (tabs.some((t) => t.id === h)) setValue(h);
    };
    fromHash();
    window.addEventListener("hashchange", fromHash);
    return () => window.removeEventListener("hashchange", fromHash);
  }, [tabs]);
  const change = (v: string) => {
    setValue(v);
    history.replaceState(null, "", `#${v}`);
  };
  return (
    <Tabs value={value} onValueChange={change} className={cn("card", className)}>
      <TabsList className="flex-wrap gap-0 px-2 pt-1 sm:flex-nowrap" aria-label="Result sections">
        {tabs.map((t) => (
          <TabsTrigger key={t.id} value={t.id} className="inline-flex items-center gap-1.5 px-3 py-2.5 text-sm sm:gap-2 sm:px-3.5 sm:py-3 sm:text-[15px] [&_svg]:size-4">
            {t.icon}
            {t.label}
            {t.count ? <span className="rounded-full bg-grey-100 px-1.5 py-0.5 font-heading text-[11px] font-semibold text-grey-700">{t.count}</span> : null}
          </TabsTrigger>
        ))}
      </TabsList>
      {tabs.map((t) => (
        <TabsContent key={t.id} value={t.id} className="p-5 pt-5">
          {t.content}
        </TabsContent>
      ))}
    </Tabs>
  );
}
