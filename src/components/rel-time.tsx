"use client";

import * as React from "react";

function rel(ms: number) {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 36) return `${h} h ago`;
  return `${Math.round(h / 24)} d ago`;
}

/** "3 min ago" with the absolute time on hover. Renders the absolute string until mounted so SSR and client HTML agree. */
export function RelTime({ date, absolute }: { date: string | Date; absolute: string }) {
  const [now, setNow] = React.useState<number | null>(null);
  React.useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);
  const d = typeof date === "string" ? new Date(date) : date;
  return <time dateTime={d.toISOString()} title={absolute}>{now === null ? absolute : rel(now - d.getTime())}</time>;
}
