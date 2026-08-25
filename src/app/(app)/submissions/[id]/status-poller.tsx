"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, Clock, PauseCircle } from "lucide-react";

type Live = {
  status: string;
  log: string;
  evaluator?: { online: boolean; lastSeenAt: string | null; queued: number; running: number } | null;
  queuePosition?: number | null;
};

function ago(iso: string | null) {
  if (!iso) return "never";
  const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 90) return `${s} s ago`;
  const m = Math.round(s / 60);
  if (m < 90) return `${m} min ago`;
  const h = Math.round(m / 60);
  return h < 36 ? `${h} h ago` : `${Math.round(h / 24)} d ago`;
}

export function StatusPoller({ id, status, log }: { id: string; status: string; log: string }) {
  const router = useRouter();
  const [live, setLive] = React.useState<Live>({ status, log });
  React.useEffect(() => {
    let stop = false;
    const tick = async () => {
      try {
        const res = await fetch(`/api/submissions/${id}/status`, { cache: "no-store" });
        if (!res.ok) return;
        const j = (await res.json()) as Live;
        if (stop) return;
        setLive(j);
        if (j.status === "COMPLETED" || j.status === "FAILED") {
          router.refresh();
          return;
        }
      } catch {}
      if (!stop) setTimeout(tick, 2500);
    };
    const t = setTimeout(tick, 1000);
    return () => {
      stop = true;
      clearTimeout(t);
    };
  }, [id, router]);

  const running = live.status === "RUNNING";
  const ev = live.evaluator;
  const offline = ev ? !ev.online : false;
  const pos = live.queuePosition;

  const title = running ? "Evaluating against blinded data…" : offline ? "Queued — evaluation machine is currently paused" : "Queued for evaluation";
  const body = running
    ? "Running all blinded drive cycles across four cells and six temperatures, plus the robustness sweeps. A full run takes roughly 30–60 minutes; this page updates automatically and you will be e-mailed with the PDF report."
    : offline
      ? `The evaluator runs on a lab machine that is offline right now (last seen ${ago(ev?.lastSeenAt ?? null)}). Nothing is lost: your submission${pos ? ` is #${pos} in the queue and` : ""} will start automatically as soon as it is back. You can close this page — the results arrive by e-mail.`
      : pos && pos > 1
        ? `Your submission is #${pos} in the queue${ev?.running ? ` · ${ev.running} evaluating now` : ""}. Each full run takes roughly 30–60 minutes; you can close this page — the results arrive by e-mail.`
        : "Your submission is next in line and will start within seconds.";

  return (
    <div className="card p-5" aria-live="polite">
      <div className="flex items-center gap-3">
        {running ? <Loader2 className="size-5 animate-spin text-bayfront" /> : offline ? <PauseCircle className="size-5 text-[#9a6a17]" /> : <Clock className="size-5 text-grey-500" />}
        <div>
          <p className="font-heading font-semibold text-ink">{title}</p>
          <p className="text-sm text-grey-700">{body}</p>
        </div>
      </div>
      <div className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-grey-200">
        <div className={running ? "h-full w-1/3 animate-[slide_1.6s_ease-in-out_infinite] rounded-full bg-maroon" : offline ? "h-full w-1/12 rounded-full bg-gold-400" : "h-full w-1/12 rounded-full bg-grey-400"} />
      </div>
      {live.log ? <pre className="mt-4 max-h-48 overflow-auto rounded-brand bg-grey-900 p-3 text-xs text-white">{live.log}</pre> : null}
      <style>{`@keyframes slide{0%{transform:translateX(-100%)}100%{transform:translateX(400%)}}`}</style>
    </div>
  );
}
