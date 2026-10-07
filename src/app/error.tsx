"use client";

import * as React from "react";
import Link from "next/link";
import { RotateCcw, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Route-level crash screen (replaces Next's grey "Application error" text). It reports itself to the
 * administrators (reference, page, browser) the moment it renders, so the visitor only has to retry.
 */
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const [reported, setReported] = React.useState<"sending" | "sent" | "failed">("sending");
  React.useEffect(() => {
    const body = JSON.stringify({ digest: error.digest, url: window.location.href, message: error.digest ? "" : error.message });
    fetch("/api/ops/client-error", { method: "POST", headers: { "Content-Type": "application/json" }, body })
      .then((r) => setReported(r.ok ? "sent" : "failed"))
      .catch(() => setReported("failed"));
  }, [error]);

  return (
    <div className="container-site flex min-h-[55vh] flex-col items-center justify-center py-16 text-center">
      <ShortCircuit />
      <h1 className="mt-5 font-heading text-4xl font-bold text-ink">Something short-circuited</h1>
      <p className="mt-2 max-w-md text-grey-700">An unexpected error occurred while rendering this page. Trying again usually works; if the site was just updated, reloading is enough.</p>
      <p className="mt-3 inline-flex items-center gap-1.5 text-sm text-grey-600" aria-live="polite">
        {reported === "sent" ? <><CheckCircle2 className="size-4 text-forest" /> Reported to the administrators{error.digest ? ` (ref ${error.digest.slice(0, 8)})` : ""}.</> : reported === "sending" ? "Reporting to the administrators…" : <>Could not send the report automatically. <Link href="/contact?category=bug" className="text-maroon underline">Tell us about it</Link>.</>}
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <Button onClick={reset}><RotateCcw /> Try again</Button>
        <Button asChild variant="outline"><Link href="/">Home</Link></Button>
      </div>
    </div>
  );
}

/** A cell whose charge drops as a spark arcs between its terminals. SVG-native animation, no JS. */
function ShortCircuit() {
  return (
    <svg viewBox="0 0 160 96" className="h-24 w-40" role="img" aria-label="A battery cell short-circuiting">
      {/* cell body */}
      <rect x="18" y="30" width="104" height="40" rx="6" fill="none" stroke="#7A003C" strokeWidth="3" />
      <rect x="122" y="42" width="8" height="16" rx="2" fill="#7A003C" />
      {/* charge level, draining */}
      <rect x="24" y="36" height="28" rx="3" fill="#FDBF57">
        <animate attributeName="width" values="92;92;60;60;22;22;92" keyTimes="0;0.2;0.3;0.55;0.65;0.9;1" dur="3.2s" repeatCount="indefinite" />
        <animate attributeName="fill" values="#FDBF57;#FDBF57;#f0a640;#f0a640;#d9534f;#d9534f;#FDBF57" keyTimes="0;0.2;0.3;0.55;0.65;0.9;1" dur="3.2s" repeatCount="indefinite" />
      </rect>
      {/* the short: a wire from terminal to terminal, and the bolt that jumps it */}
      <path d="M12 50 C 2 50, 2 14, 40 12 L 120 12 C 150 12, 152 50, 134 50" fill="none" stroke="#495965" strokeWidth="2" strokeDasharray="4 3" />
      <path d="M86 4 L 72 18 L 84 18 L 70 34" fill="none" stroke="#FDBF57" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
        <animate attributeName="opacity" values="0;1;0;1;0;0;1;0;0" keyTimes="0;0.05;0.1;0.15;0.2;0.5;0.55;0.6;1" dur="3.2s" repeatCount="indefinite" />
      </path>
      {/* sparks */}
      {[[62, 14, 0.1], [96, 10, 0.55], [78, 26, 0.58]].map(([cx, cy, begin]) => (
        <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="0" fill="#FDBF57">
          <animate attributeName="r" values="0;3.5;0" dur="0.6s" begin={`${begin * 3.2}s`} repeatCount="indefinite" />
          <animate attributeName="opacity" values="1;0.6;0" dur="0.6s" begin={`${begin * 3.2}s`} repeatCount="indefinite" />
        </circle>
      ))}
      {/* a wisp of smoke once the cell is low */}
      <path d="M70 30 c -6 -6, 6 -10, 0 -16" fill="none" stroke="#9aa3ab" strokeWidth="2" strokeLinecap="round">
        <animate attributeName="opacity" values="0;0;0.8;0;0" keyTimes="0;0.62;0.75;0.9;1" dur="3.2s" repeatCount="indefinite" />
        <animateTransform attributeName="transform" type="translate" values="0 0;0 0;0 -10;0 -16;0 0" keyTimes="0;0.62;0.75;0.9;1" dur="3.2s" repeatCount="indefinite" />
      </path>
    </svg>
  );
}
