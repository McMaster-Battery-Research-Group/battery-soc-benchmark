"use client";

import * as React from "react";

export function Countdown({ target }: { target: string }) {
  const [now, setNow] = React.useState<number | null>(null);
  React.useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const diff = Math.max(0, new Date(target).getTime() - (now ?? new Date(target).getTime()));
  const d = Math.floor(diff / 86400e3);
  const h = Math.floor((diff % 86400e3) / 3600e3);
  const m = Math.floor((diff % 3600e3) / 60e3);
  const s = Math.floor((diff % 60e3) / 1000);
  const cell = (v: number, l: string) => (
    <div className="text-center">
      <div className="font-heading text-3xl font-bold tabular text-white">{now === null ? "–" : String(v).padStart(2, "0")}</div>
      <div className="text-[11px] uppercase tracking-wide text-white/70">{l}</div>
    </div>
  );
  return (
    <div className="mt-2 grid grid-cols-4 gap-2" aria-live="off">
      {cell(d, "days")}{cell(h, "hrs")}{cell(m, "min")}{cell(s, "sec")}
    </div>
  );
}
