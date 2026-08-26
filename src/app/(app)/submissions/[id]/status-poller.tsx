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

function fmtDuration(sec: number) {
  if (sec < 60) return "under a minute";
  const m = Math.round(sec / 60);
  if (m < 60) return `about ${m} min`;
  const h = Math.floor(m / 60);
  return `about ${h} h ${m - h * 60} min`;
}

/**
 * Progress from the evaluator log. socbench_eval prints lines like
 *   "2026-08-25T23:14:22Z [eval] [19:14:22]  78.5% | cycle:m1000:26"
 * so the last percentage is the fraction done; the timestamp of the
 * "started evaluation" line gives elapsed time, from which we extrapolate.
 */
function progressFromLog(log: string): { pct: number | null; etaSec: number | null; stage: string | null } {
  if (!log) return { pct: null, etaSec: null, stage: null };
  const lines = log.split("\n");
  let pct: number | null = null;
  let stage: string | null = null;
  let lastAt: number | null = null;
  for (let i = lines.length - 1; i >= 0; i--) {
    const m = /^(\S+) .*?(\d{1,3}(?:\.\d+)?)%\s*\|\s*(.+)$/.exec(lines[i]);
    if (m) {
      stage = m[3].trim();
      // the validation step reports its own 100 % before the real run starts — treat it as "just begun"
      pct = stage.startsWith("validation") ? 1 : Math.min(100, Number(m[2]));
      lastAt = Date.parse(m[1]);
      break;
    }
  }
  const startLine = lines.find((l) => /started evaluation/.test(l));
  const startAt = startLine ? Date.parse(startLine.split(" ")[0]) : NaN;
  let etaSec: number | null = null;
  if (pct !== null && pct >= 3 && pct < 100 && Number.isFinite(startAt) && lastAt) {
    const elapsed = (lastAt - startAt) / 1000;
    etaSec = Math.max(30, (elapsed * (100 - pct)) / pct);
  }
  return { pct, etaSec, stage };
}

const STAGE_LABEL: Record<string, string> = { validation: "validating the model", cycle: "blinded drive cycles", isoc: "initial-SOC robustness sweep", offset: "current-offset robustness sweep", charge: "charging cycles", scoring: "scoring" };

export function StatusPoller({ id, status, log }: { id: string; status: string; log: string }) {
  const router = useRouter();
  const [live, setLive] = React.useState<Live>({ status, log });
  const logRef = React.useRef<HTMLPreElement>(null);

  React.useEffect(() => {
    let stop = false;
    const tick = async () => {
      try {
        const res = await fetch(`/api/submissions/${id}/status`, { cache: "no-store" });
        if (res.status === 404) {
          // cancelled (and deleted) while we were watching
          window.location.replace("/submissions?cancelled=1");
          return;
        }
        if (!res.ok) return;
        const j = (await res.json()) as Live;
        if (stop) return;
        setLive(j);
        if (j.status === "COMPLETED" || j.status === "FAILED") {
          // Reload the server-rendered page so the results (charts, report link) appear without a manual refresh.
          router.refresh();
          setTimeout(() => window.location.replace(`/submissions/${id}`), 800);
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

  // keep the newest log lines in view
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
  const body = running
    ? pct !== null
      ? `${pct.toFixed(0)} % done${stageLabel ? ` · ${stageLabel}` : ""}${etaSec !== null ? ` · ${fmtDuration(etaSec)} remaining` : ""}. This page updates automatically; you will also be e-mailed with the PDF report.`
      : "Starting up — running all blinded drive cycles across four cells and six temperatures, plus the robustness sweeps. A full run takes roughly 30–60 minutes; this page updates automatically and you will be e-mailed with the PDF report."
    : offline
      ? `The evaluator runs on a lab machine that is offline right now (last seen ${ago(ev?.lastSeenAt ?? null)}). Nothing is lost: your submission${pos ? ` is #${pos} in the queue and` : ""} will start automatically as soon as it is back. You can close this page — the results arrive by e-mail.`
      : pos && pos > 1
        ? `Your submission is #${pos} in the queue${ev?.running ? ` · ${ev.running} evaluating now` : ""}. Each full run takes roughly 30–60 minutes; you can close this page — the results arrive by e-mail.`
        : "Your submission is next in line and will start within seconds.";

  return (
    <div className="card p-5" aria-live="polite">
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
