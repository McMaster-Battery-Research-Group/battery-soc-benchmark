"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Horizontal scroll container with a second scrollbar above the content, so a wide table can be
 * scrolled sideways without first scrolling to its bottom edge. The top bar only appears when the
 * content overflows, and the two stay in step.
 */
export function TopScrollbar({ className, children }: { className?: string; children: React.ReactNode }) {
  const top = React.useRef<HTMLDivElement>(null);
  const body = React.useRef<HTMLDivElement>(null);
  const spacer = React.useRef<HTMLDivElement>(null);
  const lock = React.useRef(false);
  const [needed, setNeeded] = React.useState(false);

  React.useEffect(() => {
    const b = body.current, s = spacer.current;
    if (!b || !s) return;
    const sync = () => {
      s.style.width = `${b.scrollWidth}px`;
      setNeeded(b.scrollWidth > b.clientWidth + 1);
    };
    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(b);
    if (b.firstElementChild) ro.observe(b.firstElementChild);
    return () => ro.disconnect();
  }, []);

  const mirror = (from: HTMLDivElement | null, to: HTMLDivElement | null) => {
    if (!from || !to || lock.current) return;
    lock.current = true;
    to.scrollLeft = from.scrollLeft;
    requestAnimationFrame(() => { lock.current = false; });
  };

  return (
    <div className={className}>
      <div ref={top} onScroll={() => mirror(top.current, body.current)} className={cn("top-scrollbar overflow-x-auto overflow-y-hidden", needed ? "block" : "hidden")} aria-hidden>
        <div ref={spacer} className="h-px" />
      </div>
      <div ref={body} onScroll={() => mirror(body.current, top.current)} className="overflow-x-auto">
        {children}
      </div>
    </div>
  );
}
