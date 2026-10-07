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
export function HeroTrace({ trace }: { trace: ShowcaseTrace | null }) {
  const data = trace ?? synthetic();
  const W = 560, H = 130, n = data.t.length, tMax = data.t[n - 1] || 1;
  const x = (i: number) => (data.t[i] / tMax) * W;
  const y = (v: number) => 6 + (1 - Math.min(100, Math.max(0, v)) / 100) * (H - 12);
  const line = (arr: number[]) => arr.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(" ");
  const band = `${line(data.actual)} ${[...data.estimated.keys()].reverse().map((i) => `L${x(i).toFixed(1)} ${y(data.estimated[i]).toFixed(1)}`).join(" ")} Z`;
  return (
    <figure className="mt-5">
      <figcaption className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 text-xs text-white/75">
        <span>
          {trace ? <><Link href={`/submissions/${trace.submissionId}`} className="font-semibold text-white hover:underline">{trace.modelName}</Link>, the current leader, on {trace.label}</> : <>What the evaluator measures: an estimate against the reference SOC over a drive cycle</>}
        </span>
        <span className="flex items-center gap-3">
          <span className="inline-flex items-center gap-1.5"><span className="h-0.5 w-4 rounded bg-white/80" /> reference</span>
          <span className="inline-flex items-center gap-1.5"><span className="h-0.5 w-4 rounded bg-gold" /> estimate</span>
        </span>
      </figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} className="mt-2 h-auto w-full" role="img" aria-label={`Reference SOC and estimate over ${data.label}`}>
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
