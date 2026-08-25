"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, Clock } from "lucide-react";

export function StatusPoller({ id, status, log }: { id: string; status: string; log: string }) {
  const router = useRouter();
  const [live, setLive] = React.useState({ status, log });
  React.useEffect(() => {
    let stop = false;
    const tick = async () => {
      try {
        const res = await fetch(`/api/submissions/${id}/status`, { cache: "no-store" });
        if (!res.ok) return;
        const j = (await res.json()) as { status: string; log: string };
        if (stop) return;
        setLive(j);
        if (j.status === "COMPLETED" || j.status === "FAILED") {
          router.refresh();
          return;
        }
      } catch {}
      if (!stop) setTimeout(tick, 2500);
    };
    const t = setTimeout(tick, 2500);
    return () => {
      stop = true;
      clearTimeout(t);
    };
  }, [id, router]);

  const running = live.status === "RUNNING";
  return (
    <div className="card p-5" aria-live="polite">
      <div className="flex items-center gap-3">
        {running ? <Loader2 className="size-5 animate-spin text-bayfront" /> : <Clock className="size-5 text-grey-500" />}
        <div>
          <p className="font-heading font-semibold text-ink">{running ? "Evaluating against blinded data…" : "Queued for evaluation"}</p>
          <p className="text-sm text-grey-700">{running ? "Running all blinded drive cycles across four cells and six temperatures. Typical runtime is a few minutes; up to an hour for heavy models." : "Your submission is waiting for a free evaluation slot."}</p>
        </div>
      </div>
      <div className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-grey-200">
        <div className={running ? "h-full w-1/3 animate-[slide_1.6s_ease-in-out_infinite] rounded-full bg-maroon" : "h-full w-1/12 rounded-full bg-grey-400"} />
      </div>
      {live.log ? <pre className="mt-4 max-h-48 overflow-auto rounded-brand bg-grey-900 p-3 text-xs text-white">{live.log}</pre> : null}
      <style>{`@keyframes slide{0%{transform:translateX(-100%)}100%{transform:translateX(400%)}}`}</style>
    </div>
  );
}
