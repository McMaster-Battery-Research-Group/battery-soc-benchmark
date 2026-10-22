"use client";

import * as React from "react";
import Link from "next/link";
import { RotateCcw, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Route-level crash screen (replaces Next's grey "Application error" text). It reports itself to the
 * administrators (reference, page, browser) the moment it renders, so the visitor only has to retry.
 *
 * One case is handled silently: a page that was open across a deploy posts a server-action id the new
 * build no longer knows ("Server Action … was not found on the server"). That is not a fault, so the
 * page reloads itself once instead of showing the error or paging the administrators.
 */
const STALE_ACTION = /was not found on the server|Server Reference ID|failed-to-find-server-action/i;

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const [reported, setReported] = React.useState<"sending" | "sent" | "failed" | "reloading">("sending");
  React.useEffect(() => {
    if (STALE_ACTION.test(error.message ?? "")) {
      let recent = false;
      try {
        const last = Number(sessionStorage.getItem("socbench.stale-reload") ?? 0);
        recent = Date.now() - last < 60_000;
        if (!recent) sessionStorage.setItem("socbench.stale-reload", String(Date.now()));
      } catch {}
      if (!recent) {
        setReported("reloading");
        window.location.reload();
        return;
      }
    }
    const body = JSON.stringify({ digest: error.digest, url: window.location.href, message: error.digest ? "" : error.message });
    fetch("/api/ops/client-error", { method: "POST", headers: { "Content-Type": "application/json" }, body })
      .then((r) => setReported(r.ok ? "sent" : "failed"))
      .catch(() => setReported("failed"));
  }, [error]);

  if (reported === "reloading") {
    return (
      <div className="container-site flex min-h-[55vh] flex-col items-center justify-center py-16 text-center">
        <p className="text-grey-700">The site was updated while this page was open. Reloading…</p>
      </div>
    );
  }
  return (
    <div className="container-site flex min-h-[55vh] flex-col items-center justify-center py-16 text-center">
      <ThermalRunaway />
      <h1 className="mt-5 font-heading text-4xl font-bold text-ink">Something overheated</h1>
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

/**
 * A cell going into thermal runaway: the charge glows from gold to red, the can swells, heat shimmers
 * off the top, the vent at the terminal flares and smoke rises. SVG-native animation, no JS.
 */
function ThermalRunaway() {
  const dur = "3.2s";
  return (
    <svg viewBox="0 0 170 112" className="h-28 w-44" role="img" aria-label="A battery cell overheating into thermal runaway">
      {/* heat shimmer rising off the can */}
      {[36, 58, 80, 102].map((x, i) => (
        <path key={x} d={`M${x} 44 c 5 -4, -5 -8, 0 -12 c 5 -4, -5 -8, 0 -12`} fill="none" stroke="#f0a640" strokeWidth="2" strokeLinecap="round" opacity="0">
          <animate attributeName="opacity" values="0;0;0.9;0" keyTimes="0;0.3;0.55;1" dur="1.8s" begin={`${i * 0.4}s`} repeatCount="indefinite" />
          <animateTransform attributeName="transform" type="translate" values="0 10;0 -16" dur="1.8s" begin={`${i * 0.4}s`} repeatCount="indefinite" />
        </path>
      ))}
      {/* the can, swelling as it heats */}
      <rect x="18" y="50" width="104" height="40" rx="6" fill="none" stroke="#7A003C" strokeWidth="3">
        <animate attributeName="x" values="18;18;17;16;17;18" keyTimes="0;0.25;0.5;0.75;0.9;1" dur={dur} repeatCount="indefinite" />
        <animate attributeName="width" values="104;104;106;108;106;104" keyTimes="0;0.25;0.5;0.75;0.9;1" dur={dur} repeatCount="indefinite" />
        <animate attributeName="y" values="50;50;48;46;48;50" keyTimes="0;0.25;0.5;0.75;0.9;1" dur={dur} repeatCount="indefinite" />
        <animate attributeName="height" values="40;40;44;48;44;40" keyTimes="0;0.25;0.5;0.75;0.9;1" dur={dur} repeatCount="indefinite" />
        <animate attributeName="stroke" values="#7A003C;#7A003C;#a3242e;#c0392b;#a3242e;#7A003C" keyTimes="0;0.25;0.5;0.75;0.9;1" dur={dur} repeatCount="indefinite" />
      </rect>
      <rect x="122" y="62" width="8" height="16" rx="2" fill="#7A003C">
        <animate attributeName="fill" values="#7A003C;#7A003C;#a3242e;#c0392b;#a3242e;#7A003C" keyTimes="0;0.25;0.5;0.75;0.9;1" dur={dur} repeatCount="indefinite" />
      </rect>
      {/* the charge: full and gold, then glowing orange, then red hot, pulsing with the swelling */}
      <rect x="24" y="56" width="92" height="28" rx="3" fill="#FDBF57">
        <animate attributeName="fill" values="#FDBF57;#f7b24a;#ef8a2c;#d9402a;#ef8a2c;#FDBF57" keyTimes="0;0.25;0.5;0.75;0.9;1" dur={dur} repeatCount="indefinite" />
        <animate attributeName="x" values="24;24;23;22;23;24" keyTimes="0;0.25;0.5;0.75;0.9;1" dur={dur} repeatCount="indefinite" />
        <animate attributeName="width" values="92;92;94;96;94;92" keyTimes="0;0.25;0.5;0.75;0.9;1" dur={dur} repeatCount="indefinite" />
        <animate attributeName="y" values="56;56;54;52;54;56" keyTimes="0;0.25;0.5;0.75;0.9;1" dur={dur} repeatCount="indefinite" />
        <animate attributeName="height" values="28;28;32;36;32;28" keyTimes="0;0.25;0.5;0.75;0.9;1" dur={dur} repeatCount="indefinite" />
      </rect>
      {/* the vent flares at the terminal once the cell is hot */}
      <path d="M133 70 c 5 -9, 1 -13, 7 -18 c 1 8, 9 9, 7 18 c -2 6, -12 6, -14 0 z" fill="#ef8a2c">
        <animate attributeName="opacity" values="0;0;0;1;0.6;1;0.8;0" keyTimes="0;0.45;0.5;0.6;0.7;0.8;0.9;1" dur={dur} repeatCount="indefinite" />
        <animate attributeName="d" values="M133 70 c 5 -9, 1 -13, 7 -18 c 1 8, 9 9, 7 18 c -2 6, -12 6, -14 0 z;M133 70 c 5 -13, 0 -18, 7 -26 c 2 10, 10 13, 7 26 c -2 6, -12 6, -14 0 z;M133 70 c 5 -9, 1 -13, 7 -18 c 1 8, 9 9, 7 18 c -2 6, -12 6, -14 0 z" dur="0.5s" repeatCount="indefinite" />
      </path>
      <path d="M136 70 c 3 -5, 1 -8, 4 -11 c 1 5, 5 6, 4 11 c -1 3, -7 3, -8 0 z" fill="#FDBF57">
        <animate attributeName="opacity" values="0;0;0;1;0.7;1;0" keyTimes="0;0.45;0.5;0.62;0.75;0.88;1" dur={dur} repeatCount="indefinite" />
      </path>
      {/* smoke, rising from the vent and drifting */}
      {[[142, 0.55], [150, 0.68], [146, 0.8]].map(([cx, begin]) => (
        <circle key={`${cx}-${begin}`} cx={cx} cy="50" r="0" fill="#9aa3ab">
          <animate attributeName="r" values="0;4;7;0" dur="1.4s" begin={`${Number(begin) * 3.2}s`} repeatCount="indefinite" />
          <animate attributeName="opacity" values="0.8;0.6;0.2;0" dur="1.4s" begin={`${Number(begin) * 3.2}s`} repeatCount="indefinite" />
          <animateTransform attributeName="transform" type="translate" values="0 0;4 -14;8 -28" dur="1.4s" begin={`${Number(begin) * 3.2}s`} repeatCount="indefinite" />
        </circle>
      ))}
    </svg>
  );
}
