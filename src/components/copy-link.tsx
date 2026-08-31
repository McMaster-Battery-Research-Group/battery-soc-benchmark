"use client";

import * as React from "react";
import { Check, Link2 } from "lucide-react";

/** Copies the page (or anchor) URL; tiny inline confirmation instead of a toast. */
export function CopyLink({ path, label = "Copy link", className }: { path?: string; label?: string; className?: string }) {
  const [done, setDone] = React.useState(false);
  const copy = async () => {
    const url = `${window.location.origin}${path ?? window.location.pathname}`;
    try {
      await navigator.clipboard.writeText(url);
      setDone(true);
      setTimeout(() => setDone(false), 1600);
    } catch {
      window.prompt("Copy this link:", url);
    }
  };
  return (
    <button type="button" onClick={copy} className={`inline-flex items-center gap-1.5 rounded-brand border border-border bg-white px-2.5 py-1.5 font-heading text-xs font-medium text-grey-800 hover:bg-grey-100 ${className ?? ""}`}>
      {done ? <Check className="size-3.5 text-forest" /> : <Link2 className="size-3.5" />} {done ? "Copied" : label}
    </button>
  );
}
