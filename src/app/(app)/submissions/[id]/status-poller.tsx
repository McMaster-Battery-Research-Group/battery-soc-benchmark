"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2, Clock, PauseCircle } from "lucide-react";
import { progressFromLog, STAGE_LABEL, fmtDuration } from "@/lib/progress";
import { queueCelebration } from "@/components/celebration";

type Live = {
  status: string;
  log: string;
  evaluator?: { online: boolean; lastSeenAt: string | null; queued: number; running: number; capacity?: number } | null;
  queuePosition?: number | null;
  queueWaitSec?: number | null;
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
  const [, setTick] = React.useState(0); // re-render every few seconds so "remaining" counts down between polls
  const logRef = React.useRef<HTMLPreElement>(null);
  const cardRef = React.useRef<HTMLDivElement>(null);

  // Fresh submission (redirected here with ?new=1): bring the live status card — and its console — into view.
  // Scroll more than once: the browser restores scroll after navigation and the card grows when the log arrives.
  // NB: read the query via Next's router state, not window.location — after a server-action redirect this component
  // mounts while the address bar still shows the previous URL (/submit), so window.location.search would be empty.
  const isNew = useSearchParams().has("new");
  const scrolledForLog = React.useRef(false);
  const reveal = React.useCallback(() => cardRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), []);
  React.useEffect(() => {
    if (!isNew) return;
    const timers = [100, 600, 1500, 3000].map((ms) => setTimeout(reveal, ms));
    return () => timers.forEach(clearTimeout);
  }, [isNew, reveal]);
  React.useEffect(() => {
    if (!isNew || scrolledForLog.current || !live.log) return;
    scrolledForLog.current = true; // first console output: scroll once more so the terminal is on screen
    const t = setTimeout(reveal, 50);
    return () => clearTimeout(t);
  }, [isNew, live.log, reveal]);

  React.useEffect(() => {
    let stop = false;
    const tick = async () => {
      try {
        const res = await fetch(`/api/submissions/${id}/status`, { cache: "no-store" });
        if (res.status === 404) {
          window.location.replace("/submissions?cancelled=1");
          return;
        }
        if (!res.ok) return;
        const j = (await res.json()) as Live;
        if (stop) return;
        setLive(j);
        if (j.status === "COMPLETED" || j.status === "FAILED") {
          if (j.status === "COMPLETED") queueCelebration(id);
          router.refresh();
          setTimeout(() => window.location.replace(`/submissions/${id}`), 800);
          return;
        }
      } catch {}
      if (!stop) setTimeout(tick, 2500);
    };
    const t = setTimeout(tick, 1000);
    const clock = setInterval(() => setTick((n) => n + 1), 5000);
    return () => {
      stop = true;
      clearTimeout(t);
      clearInterval(clock);
    };
  }, [id, router]);

  React.useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [live.log]);

  const running = live.status === "RUNNING";
  const ev = live.evaluator;
  const offline = ev ? !ev.online : false;
  const pos = live.queuePosition;
  const { pct, etaSec, stage } = running ? progressFromLog(live.log) : { pct: null, etaSec: null, stage: null };
  const stageLabel = stage ? STAGE_LABEL[stage.split(":")[0]] ?? stage : null;

  const title = running ? "Evaluating against blinded data…" : offline ? "Queued — evaluation machine is currently paused" : "Queued for evaluation";
  let body: string;
  if (running) {
    body =
      pct !== null
        ? `${pct.toFixed(0)} % done${stageLabel ? ` · ${stageLabel}` : ""}${etaSec !== null ? ` · ${fmtDuration(etaSec)} remaining` : ""}. This page updates automatically; you will also be e-mailed with the PDF report.`
        : "Starting up — running all blinded drive cycles across four cells and six temperatures, plus the robustness sweeps. This page updates automatically and you will be e-mailed with the PDF report.";
  } else if (offline) {
    body = `The evaluator runs on a lab machine that is offline right now (last seen ${ago(ev?.lastSeenAt ?? null)}). Nothing is lost: your submission${pos ? ` is #${pos} in the queue and` : ""} will start automatically as soon as it is back. You can close this page — the results arrive by e-mail.`;
  } else {
    const busy = ev?.running ?? 0;
    const slots = ev?.capacity ?? 1;
    const wait = live.queueWaitSec;
    if ((pos ?? 1) === 1 && busy < slots) body = "Your submission is next in line and will start within seconds.";
    else
      body = `Your submission is #${pos ?? 1} in the queue · ${busy} evaluating now${slots > 1 ? ` (${slots} parallel slots)` : ""}. Expected to start in ${wait !== null && wait !== undefined ? fmtDuration(wait) : "a while"} (based on the live progress of the current run and typical run times for the models ahead of you). You can close this page; the results arrive by e-mail.`;
  }

  return (
    <div ref={cardRef} className="card scroll-mt-24 p-5" aria-live="polite">
      <div className="flex items-center gap-3">
        {running ? <Loader2 className="size-5 animate-spin text-bayfront" /> : offline ? <PauseCircle className="size-5 text-[#9a6a17]" /> : <Clock className="size-5 text-grey-500" />}
        <div className="min-w-0 flex-1">
          <p className="font-heading font-semibold text-ink">{title}</p>
          <p className="text-sm text-grey-700">{body}</p>
        </div>
        {running && pct !== null ? <p className="shrink-0 font-heading text-2xl font-bold tabular text-ink">{pct.toFixed(0)}<span className="text-base text-grey-600"> %</span></p> : null}
      </div>
      <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-grey-200" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct ?? undefined}>
        {running && pct !== null ? (
          <div className="h-full rounded-full bg-maroon transition-[width] duration-700" style={{ width: `${Math.max(2, pct)}%` }} />
        ) : (
          <div className={running ? "h-full w-1/3 animate-[slide_1.6s_ease-in-out_infinite] rounded-full bg-maroon" : offline ? "h-full w-1/12 rounded-full bg-gold-400" : "h-full w-1/12 rounded-full bg-grey-400"} />
        )}
      </div>
      {live.log ? <pre ref={logRef} className="mt-4 max-h-96 max-w-full overflow-auto whitespace-pre-wrap break-all rounded-brand bg-grey-900 p-3 text-xs leading-relaxed text-white">{live.log}</pre> : null}
      <style>{`@keyframes slide{0%{transform:translateX(-100%)}100%{transform:translateX(400%)}}`}</style>
    </div>
  );
}
