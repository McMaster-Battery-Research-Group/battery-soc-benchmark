"use client";

import * as React from "react";
import confetti from "canvas-confetti";
import { PartyPopper, X } from "lucide-react";

const KEY = "socbench.celebrated";
const PENDING = "socbench.celebrate.pending";

/** Mark a submission so the next page load fires the celebration (set by the live status poller just before it reloads). */
export function queueCelebration(id: string) {
  try {
    sessionStorage.setItem(PENDING, id);
  } catch {}
}

function seen(): string[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "[]");
  } catch {
    return [];
  }
}

/** Brand-coloured confetti (maroon + gold) fired once per completed submission per browser: when the live page flips to
 *  COMPLETED, or the first time an author opens a recently completed submission (e.g. arriving from the results e-mail). */
export function Celebration({ id, modelName, score, rank, recentlyCompleted }: { id: string; modelName: string; score: string; rank: number | null; recentlyCompleted: boolean }) {
  const [show, setShow] = React.useState(false);

  React.useEffect(() => {
    let pending = false;
    try {
      pending = sessionStorage.getItem(PENDING) === id;
      if (pending) sessionStorage.removeItem(PENDING);
    } catch {}
    const already = seen().includes(id);
    if (!pending && (already || !recentlyCompleted)) return;
    try {
      localStorage.setItem(KEY, JSON.stringify([...seen().filter((x) => x !== id), id].slice(-200)));
    } catch {}
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setShow(true);
      return;
    }
    setShow(true);
    fire();
  }, [id, recentlyCompleted]);

  if (!show) return null;
  return (
    <div role="status" className="relative mt-6 flex items-start gap-3 overflow-hidden rounded-brand border border-gold-400 bg-gradient-to-r from-gold-100 to-white p-4">
      <PartyPopper className="mt-0.5 size-6 shrink-0 text-maroon" />
      <div className="min-w-0 flex-1 text-sm text-grey-800">
        <p className="font-heading text-base font-semibold text-ink">Evaluation complete — congratulations!</p>
        <p>
          <strong>{modelName}</strong> scored a weighted error of <strong className="text-ink">{score} %</strong>
          {rank ? <> and currently ranks <strong className="text-ink">#{rank}</strong> on the public leaderboard</> : null}. The full PDF report has been e-mailed to you{rank ? "" : " (private and legacy models are not ranked)"}.
        </p>
      </div>
      <button onClick={() => setShow(false)} className="rounded p-1 text-grey-600 hover:bg-gold-200 hover:text-ink" aria-label="Dismiss">
        <X className="size-4" />
      </button>
    </div>
  );
}

function fire() {
  const colors = ["#7a003c", "#fdbf57", "#fee5bc", "#ffffff"];
  const end = Date.now() + 1800;
  // two cannons from the bottom corners + one burst from the centre
  confetti({ particleCount: 120, spread: 80, startVelocity: 45, origin: { x: 0.5, y: 0.6 }, colors, disableForReducedMotion: true });
  (function frame() {
    confetti({ particleCount: 4, angle: 60, spread: 55, origin: { x: 0, y: 0.9 }, colors, disableForReducedMotion: true });
    confetti({ particleCount: 4, angle: 120, spread: 55, origin: { x: 1, y: 0.9 }, colors, disableForReducedMotion: true });
    if (Date.now() < end) requestAnimationFrame(frame);
  })();
}
