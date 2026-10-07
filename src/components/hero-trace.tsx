import Link from "next/link";
import { ArrowRight } from "lucide-react";

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
 * The hero chart: one real blinded drive cycle from the current leader, reference SOC (white) against
 * the submitted estimate (gold), the gap between them shaded. Falls back to an illustrative curve when
 * no public result exists yet (fresh databases).
 */
export function HeroChart({ trace, compact = false }: { trace: ShowcaseTrace | null; /** inside the leaderboard card: shorter plot, fewer labels */ compact?: boolean }) {
  const W = 1200, H = compact ? 300 : 150, padL = compact ? 96 : 46, padR = 16, padT = compact ? 16 : 10, padB = compact ? 52 : 26;
  const data = trace ?? synthetic();
  const n = data.t.length;
  const tMax = data.t[n - 1] || 1;
  const x = (i: number) => padL + (data.t[i] / tMax) * (W - padL - padR);
  const y = (v: number) => padT + (1 - Math.min(100, Math.max(0, v)) / 100) * (H - padT - padB);
  const line = (arr: number[]) => arr.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(" ");
  const band = `${line(data.actual)} ${[...data.estimated.keys()].reverse().map((i) => `L${x(i).toFixed(1)} ${y(data.estimated[i]).toFixed(1)}`).join(" ")} Z`;
  const hours = (h: number) => (h >= 1 ? `${h.toFixed(h % 1 ? 1 : 0)} h` : `${Math.round(h * 60)} min`);
  return (
    <figure>
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
        <figcaption className="min-w-0">
          <p className="font-heading text-xs font-semibold uppercase tracking-[0.14em] text-gold">{trace ? "A real result" : "What the evaluator measures"}</p>
          <p className={compact ? "mt-1 text-xs leading-snug text-white/80" : "mt-1 text-sm text-white/85"}>
            {trace ? <>Reference SOC against <Link href={`/submissions/${trace.submissionId}`} className="font-semibold text-white underline decoration-white/40 underline-offset-2 hover:decoration-white">{trace.modelName}</Link>, the current leader, on one blinded drive cycle: {trace.label}.</> : <>Reference SOC against an estimator that starts from a wrong initial SOC on one cold drive cycle.</>}
          </p>
        </figcaption>
        <ul className={compact ? "flex items-center gap-3 text-[11px] text-white/80" : "flex items-center gap-5 text-xs text-white/85"} aria-hidden>
          <li className="flex items-center gap-2"><span className="h-0.5 w-5 rounded bg-white" /> Reference SOC</li>
          <li className="flex items-center gap-2"><span className="h-0.5 w-5 rounded bg-gold" /> Estimate</li>
          <li className="flex items-center gap-2"><span className="h-3 w-5 rounded-sm bg-gold/30" /> Error</li>
        </ul>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="mt-3 h-auto w-full" role="img" aria-label={`Reference SOC and estimate over ${data.label}`}>
        {(compact ? [0, 100] : [0, 50, 100]).map((g) => (
          <g key={g}>
            <line x1={padL} x2={W - padR} y1={y(g)} y2={y(g)} stroke="#fff" strokeOpacity={g === 0 ? 0.35 : 0.12} strokeWidth="1" />
            <text x={padL - 8} y={y(g) + 4} textAnchor="end" fontSize={compact ? 30 : 11} fill="#fff" fillOpacity="0.6" fontFamily="Arial, sans-serif">{g} %</text>
          </g>
        ))}
        <path d={band} fill="#FDBF57" fillOpacity="0.3" />
        <path d={line(data.actual)} fill="none" stroke="#fff" strokeWidth={compact ? 1.8 : 2.2} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        <path d={line(data.estimated)} fill="none" stroke="#FDBF57" strokeWidth={compact ? 1.8 : 2.2} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        <g fontSize={compact ? 30 : 11} fill="#fff" fillOpacity="0.6" fontFamily="Arial, sans-serif">
          <text x={padL} y={H - 10}>0</text>
          <text x={W - padR} y={H - 10} textAnchor="end">{hours(tMax)}</text>
          <text x={(padL + W - padR) / 2} y={H - 10} textAnchor="middle">time</text>
        </g>
      </svg>
      {trace && !compact ? <p className="mt-2 text-right text-xs"><Link href={`/submissions/${trace.submissionId}`} className="inline-flex items-center gap-1 text-white/75 hover:text-white">Full result <ArrowRight className="size-3" /></Link></p> : null}
    </figure>
  );
}

/** Illustration for databases without a public result yet: a cold discharge and a converging estimate. */
function synthetic(): ShowcaseTrace {
  const N = 240;
  const t = Array.from({ length: N }, (_, i) => (i / (N - 1)) * 2);
  const actual = t.map((h) => 95 - 32 * h + 1.6 * Math.sin(h * 9) + 0.6 * Math.sin(h * 31));
  const estimated = actual.map((v, i) => v - 10 * Math.exp(-3 * t[i]) + 0.5 * Math.sin(t[i] * 47));
  return { submissionId: "", modelName: "", label: "a −20 °C drive cycle (illustration)", t, actual, estimated };
}
