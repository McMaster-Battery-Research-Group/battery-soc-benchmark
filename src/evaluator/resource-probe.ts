import { execFile } from "child_process";

/**
 * Samples a running evaluation container so every submission records what it actually needed,
 * rather than what the limits allow. Used to size the evaluation host and to justify quota
 * requests with measurements instead of defaults.
 *
 * `docker stats --no-stream` is cheap (one call per sample) and needs no privileges beyond the
 * docker socket the worker already uses. Sampling is best-effort throughout: a failed sample, a
 * container that has already exited, or a host with no Docker simply yields fewer points, never
 * an error that could fail an otherwise good evaluation.
 */
export interface ResourceUsage {
  /** Peak resident memory of the container, in MB. */
  peakMemMb: number;
  /** Mean resident memory across samples, in MB. */
  meanMemMb: number;
  /** The container's memory ceiling (`--memory`), in MB — what the peak should be read against. */
  limitMemMb: number;
  /** Peak CPU as a percentage of ONE core (200 = two cores fully busy). */
  peakCpuPct: number;
  /** Mean CPU across samples, same units. */
  meanCpuPct: number;
  /** The container's CPU ceiling (`--cpus`), as a percentage of one core. */
  limitCpuPct: number;
  /** How many samples were taken; 0 means nothing was measured. */
  samples: number;
}

const MIB = 1024 * 1024;

/** "1.234GiB" / "512MiB" / "900kB" → MB. Docker prints IEC units with mixed casing. */
function parseSize(s: string): number {
  const m = /^([\d.]+)\s*([kKMGT]?i?)B$/.exec(s.trim());
  if (!m) return 0;
  const n = Number(m[1]);
  if (!Number.isFinite(n)) return 0;
  const unit = m[2].toLowerCase().replace("i", "");
  const mult: Record<string, number> = { "": 1 / MIB, k: 1 / 1024, m: 1, g: 1024, t: 1024 * 1024 };
  return n * (mult[unit] ?? 0);
}

function sample(container: string): Promise<{ memMb: number; cpuPct: number } | null> {
  return new Promise((resolve) => {
    execFile(
      "docker",
      ["stats", "--no-stream", "--format", "{{.MemUsage}}|{{.CPUPerc}}", container],
      { timeout: 10_000, windowsHide: true },
      (err, stdout) => {
        if (err || !stdout) return resolve(null);
        // MemUsage is "used / limit"; CPUPerc is "123.45%"
        const [mem, cpu] = stdout.trim().split("|");
        const used = mem?.split("/")[0];
        const pct = Number((cpu ?? "").replace("%", ""));
        if (!used || !Number.isFinite(pct)) return resolve(null);
        const memMb = parseSize(used);
        resolve(memMb > 0 || pct > 0 ? { memMb, cpuPct: pct } : null);
      },
    );
  });
}

/**
 * Polls `container` every `intervalMs` until stopped. Returns a handle whose `stop()` resolves
 * with the aggregate, or null when nothing could be measured (no Docker, container gone early,
 * or an evaluation shorter than the first sample).
 */
export function probeContainer(container: string, opts: { intervalMs?: number; limitMemMb: number; limitCpuPct: number }) {
  const intervalMs = opts.intervalMs ?? 5_000;
  let peakMem = 0;
  let peakCpu = 0;
  let sumMem = 0;
  let sumCpu = 0;
  let n = 0;
  let stopped = false;
  let inFlight: Promise<unknown> = Promise.resolve();

  const tick = async () => {
    if (stopped) return;
    const s = await sample(container);
    if (s && !stopped) {
      peakMem = Math.max(peakMem, s.memMb);
      peakCpu = Math.max(peakCpu, s.cpuPct);
      sumMem += s.memMb;
      sumCpu += s.cpuPct;
      n++;
    }
  };

  // first sample shortly after start (the container needs a moment to report), then at interval
  const timer = setInterval(() => {
    inFlight = tick();
  }, intervalMs);
  const primer = setTimeout(() => {
    inFlight = tick();
  }, 1_500);

  return {
    async stop(): Promise<ResourceUsage | null> {
      stopped = true;
      clearInterval(timer);
      clearTimeout(primer);
      await inFlight.catch(() => {});
      if (!n) return null;
      const round = (x: number) => Math.round(x * 10) / 10;
      return {
        peakMemMb: round(peakMem),
        meanMemMb: round(sumMem / n),
        limitMemMb: opts.limitMemMb,
        peakCpuPct: round(peakCpu),
        meanCpuPct: round(sumCpu / n),
        limitCpuPct: opts.limitCpuPct,
        samples: n,
      };
    },
  };
}

/** "4g" / "512m" / "2048" (bytes) → MB, matching Docker's own --memory parsing. */
export function memLimitMb(spec: string): number {
  const m = /^(\d+(?:\.\d+)?)\s*([bkmg]?)$/i.exec(spec.trim());
  if (!m) return 0;
  const n = Number(m[1]);
  const mult: Record<string, number> = { b: 1 / MIB, "": 1 / MIB, k: 1 / 1024, m: 1, g: 1024 };
  return Math.round(n * (mult[m[2].toLowerCase()] ?? 0));
}
