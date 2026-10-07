import Link from "next/link";

export type ShowcaseTrace = {
  submissionId: string;
  modelName: string;
  /** e.g. "m80 UDDS at −20 °C" */
  label: string;
  /** hours */
  t: number[];
  /** % SOC */
  actual: number[];
  estimated: number[];
};

/**
 * Under the hero's leaderboard card: the current leader's coldest blinded drive cycle, reference SOC
 * (white) against its estimate (gold) with the error shaded. No axes or grid, one caption. Falls back
 * to a drive-cycle-shaped illustration on a database without a public result.
 */
/** Hours of the run shown: the opening stretch, where the drive-cycle shape and the estimate locking on are visible. */
const WINDOW_H = 1;

export function HeroTrace({ trace }: { trace: ShowcaseTrace | null }) {
  const full = trace ?? synthetic();
  const n = Math.max(2, full.t.filter((t) => t <= WINDOW_H).length);
  const data = { ...full, t: full.t.slice(0, n), actual: full.actual.slice(0, n), estimated: full.estimated.slice(0, n) };
  const W = 560, H = 130, tMax = data.t[n - 1] || 1;
  // vertical range follows the data, so a few percent of SOC fill the box
  const all = [...data.actual, ...data.estimated];
  const lo = Math.min(...all) - 0.5, hi = Math.max(...all) + 0.5;
  const x = (i: number) => (data.t[i] / tMax) * W;
  const y = (v: number) => 6 + (1 - (v - lo) / (hi - lo)) * (H - 12);
  const pts = (arr: number[]) => arr.map((v, i) => [x(i), y(v)] as const);
  // smooth (Catmull-Rom) path through the samples, so the down-sampled trace does not look angular
  const smooth = (p: readonly (readonly [number, number])[]) =>
    p.map(([px, py], i) => {
      if (!i) return `M${px.toFixed(1)} ${py.toFixed(1)}`;
      const p0 = p[i - 2] ?? p[i - 1], p1 = p[i - 1], p2 = p[i], p3 = p[i + 1] ?? p[i];
      const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6], c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
      return `C${c1[0].toFixed(1)} ${c1[1].toFixed(1)} ${c2[0].toFixed(1)} ${c2[1].toFixed(1)} ${px.toFixed(1)} ${py.toFixed(1)}`;
    }).join(" ");
  const line = (arr: number[]) => smooth(pts(arr));
  const band = `${line(data.actual)} L${x(n - 1).toFixed(1)} ${y(data.estimated[n - 1]).toFixed(1)} ${smooth([...pts(data.estimated)].reverse()).replace(/^M[^C]*/, "")} Z`;
  return (
    <figure className="mt-5">
      <figcaption className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 text-xs text-white/75">
        <span>
          {trace ? <><Link href={`/submissions/${trace.submissionId}`} className="font-semibold text-white hover:underline">{trace.modelName}</Link>, the current leader: the first hour of {trace.label}</> : <>What the evaluator measures: an estimate against the reference SOC over a drive cycle</>}
        </span>
        <span className="flex items-center gap-3">
          <span className="inline-flex items-center gap-1.5"><span className="h-0.5 w-4 rounded bg-white/80" /> reference</span>
          <span className="inline-flex items-center gap-1.5"><span className="h-0.5 w-4 rounded bg-gold" /> estimate</span>
        </span>
      </figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} className="mt-2 h-auto w-full" role="img" aria-label={`Reference SOC and estimate over the first hour of ${data.label}`}>
        <path d={band} fill="#FDBF57" fillOpacity="0.28" />
        <path d={line(data.actual)} fill="none" stroke="#fff" strokeOpacity="0.8" strokeWidth="1.8" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        <path d={line(data.estimated)} fill="none" stroke="#FDBF57" strokeWidth="1.8" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      </svg>
    </figure>
  );
}

/** A drive-cycle-shaped discharge (stops, regen bumps, sensor noise) and an estimate that starts wrong and locks on. */
function synthetic(): ShowcaseTrace {
  const N = 280;
  const t = Array.from({ length: N }, (_, i) => (i / (N - 1)) * 2);
  let soc = 97;
  const actual = t.map((h, i) => {
    const drive = 0.5 + 0.5 * Math.sin(i * 0.9) ** 2; // accelerating / cruising
    const regen = Math.max(0, Math.sin(i * 0.37 + 1)) ** 8 * 0.9; // braking recovers a little
    soc -= 0.26 * drive - regen * 0.3;
    return soc;
  });
  const estimated = actual.map((v, i) => v - 9 * Math.exp(-2.2 * t[i]) + 0.9 * Math.sin(i * 1.7) * (0.3 + Math.exp(-t[i])));
  return { submissionId: "", modelName: "", label: "a cold drive cycle (illustration)", t, actual, estimated };
}
