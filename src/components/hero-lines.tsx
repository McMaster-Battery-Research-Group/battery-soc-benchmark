import Link from "next/link";

export type ShowcaseSeries = { submissionId: string; modelName: string; t: number[]; estimated: number[] };
export type Showcase = {
  /** e.g. "m80 UDDS at −20 °C" */
  label: string;
  /** hours, % SOC: the reference run (identical for every model) */
  t: number[];
  actual: number[];
  /** the medallists' estimates, best first */
  series: ShowcaseSeries[];
};

/** gold, silver, bronze: the same colours as the rank medals in the card above */
const MEDAL = ["#FDBF57", "#d4d8dc", "#d9a066"];

/**
 * Under the hero's leaderboard card: the top three models' estimates over one blinded drive cycle,
 * over the whole run, against the reference SOC. Light axes, one legend, nothing else.
 * Falls back to an illustration on a database without public results.
 */
export function HeroTrace({ data: given }: { data: Showcase | null }) {
  const data = given ?? synthetic();
  const W = 560, H = 190, padL = 34, padR = 8, padT = 6, padB = 22;
  const tMax = Math.max(data.t[data.t.length - 1] || 1, ...data.series.map((s) => s.t[s.t.length - 1] || 0));
  const x = (t: number) => padL + (t / tMax) * (W - padL - padR);
  const y = (v: number) => padT + (1 - Math.min(100, Math.max(0, v)) / 100) * (H - padT - padB);
  const line = (t: number[], v: number[]) => v.map((val, i) => `${i ? "L" : "M"}${x(t[i]).toFixed(1)} ${y(val).toFixed(1)}`).join(" ");
  const hours = (h: number) => (h >= 1 ? `${Number.isInteger(h) ? h : h.toFixed(1)} h` : `${Math.round(h * 60)} min`);
  return (
    <figure className="mt-5">
      <figcaption className="text-xs text-white/75">
        {given ? <>The top three on one blinded drive cycle, {data.label}, over the whole run</> : <>What the evaluator measures: estimates against the reference SOC over a blinded drive cycle</>}
      </figcaption>
      <ul className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-white/85">
        <li className="inline-flex items-center gap-1.5"><span className="w-4 border-t-2 border-dashed border-white/85" /> reference SOC</li>
        {data.series.map((s, i) => (
          <li key={s.submissionId || i} className="inline-flex items-center gap-1.5">
            <span className="h-0.5 w-4 rounded" style={{ background: MEDAL[i] }} />
            {s.submissionId ? <Link href={`/submissions/${s.submissionId}`} className="hover:underline">{s.modelName}</Link> : s.modelName}
          </li>
        ))}
      </ul>
      <svg viewBox={`0 0 ${W} ${H}`} className="mt-2 h-auto w-full" role="img" aria-label={`Reference SOC and the top three estimates over ${data.label}`}>
        {[0, 50, 100].map((g) => (
          <g key={g}>
            <line x1={padL} x2={W - padR} y1={y(g)} y2={y(g)} stroke="#fff" strokeOpacity={g === 0 ? 0.3 : 0.1} strokeWidth="1" />
            <text x={padL - 6} y={y(g) + 3.5} textAnchor="end" fontSize="9" fill="#fff" fillOpacity="0.6" fontFamily="Arial, sans-serif">{g} %</text>
          </g>
        ))}
        <path d={line(data.t, data.actual)} fill="none" stroke="#fff" strokeOpacity="0.9" strokeWidth="1.8" strokeDasharray="5 4" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        {[...data.series].reverse().map((s, k) => {
          const i = data.series.length - 1 - k; // draw the leader last, on top
          return <path key={s.submissionId || i} d={line(s.t, s.estimated)} fill="none" stroke={MEDAL[i]} strokeOpacity={i ? 0.8 : 1} strokeWidth="1.5" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />;
        })}
        <g fontSize="9" fill="#fff" fillOpacity="0.6" fontFamily="Arial, sans-serif">
          <text x={padL} y={H - 8}>0</text>
          <text x={x(tMax / 2)} y={H - 8} textAnchor="middle">{hours(tMax / 2)}</text>
          <text x={W - padR} y={H - 8} textAnchor="end">{hours(tMax)}</text>
        </g>
      </svg>
    </figure>
  );
}

/** A cold discharge from full to empty with three estimators of decreasing quality. */
function synthetic(): Showcase {
  const N = 240;
  const t = Array.from({ length: N }, (_, i) => (i / (N - 1)) * 4.5);
  const actual = t.map((h, i) => 100 - 21 * h + 0.6 * Math.sin(i * 0.9) ** 2 - 0.4 * Math.max(0, Math.sin(i * 0.37)) ** 6);
  const est = (bias: number, wobble: number, decay: number) => actual.map((v, i) => v - bias * Math.exp(-decay * t[i]) + wobble * Math.sin(i * 1.7) * (0.3 + 0.7 * Math.exp(-t[i] / 2)));
  return {
    label: "a −20 °C drive cycle (illustration)", t, actual,
    series: [{ submissionId: "", modelName: "best model", t, estimated: est(8, 0.8, 2.5) }, { submissionId: "", modelName: "second", t, estimated: est(12, 1.6, 1.5) }, { submissionId: "", modelName: "third", t, estimated: est(15, 2.4, 1) }],
  };
}
