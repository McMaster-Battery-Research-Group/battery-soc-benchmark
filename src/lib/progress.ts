/**
 * Progress + ETA from an evaluation job log. Shared by the status page (client)
 * and the queue estimator (server).
 *
 * The evaluator emits one line per input matrix, weighted by samples so the
 * percentage is proportional to work done:
 *   2026-08-26T01:14:27.123Z [eval] [01:14:27]  12.5% | cycle:m80:3
 * The worker's "started evaluation" line gives the start time.
 */
export type Progress = { pct: number | null; etaSec: number | null; elapsedSec: number | null; stage: string | null };

const PROGRESS_RE = /^(\S+) .*?(\d{1,3}(?:\.\d+)?)%\s*\|\s*(.+)$/;

export function progressFromLog(log: string, now = Date.now()): Progress {
  if (!log) return { pct: null, etaSec: null, elapsedSec: null, stage: null };
  const lines = log.split("\n");
  let pct: number | null = null;
  let stage: string | null = null;
  let lastAt: number | null = null;
  for (let i = lines.length - 1; i >= 0; i--) {
    const m = PROGRESS_RE.exec(lines[i]);
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
  const elapsedSec = Number.isFinite(startAt) ? Math.max(0, (now - startAt) / 1000) : null;
  let etaSec: number | null = null;
  if (pct !== null && pct >= 3 && pct < 100 && Number.isFinite(startAt) && lastAt) {
    const worked = (lastAt - startAt) / 1000; // time it took to reach `pct`
    etaSec = Math.max(30, (worked * (100 - pct)) / pct - Math.max(0, (now - lastAt) / 1000));
  }
  return { pct, etaSec, elapsedSec, stage };
}

export const STAGE_LABEL: Record<string, string> = {
  validation: "validating the model",
  cycle: "blinded drive cycles",
  isoc: "initial-SOC robustness sweep",
  offset: "current-offset robustness sweep",
  charge: "charging cycles",
  scoring: "scoring",
};

export function fmtDuration(sec: number) {
  if (sec < 60) return "under a minute";
  const m = Math.round(sec / 60);
  if (m < 60) return `about ${m} min`;
  const h = Math.floor(m / 60);
  return `about ${h} h ${m - h * 60} min`;
}
