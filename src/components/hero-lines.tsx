/**
 * Quiet decoration under the hero's leaderboard card: a reference SOC (white) and an estimate that
 * settles onto it (gold), two smooth lines with small end labels and nothing else.
 */
export function HeroLines({ className }: { className?: string }) {
  const W = 560, H = 150, N = 160, padR = 104;
  const soc = (t: number) => 0.86 - 0.5 * t + 0.03 * Math.sin(2 * Math.PI * 1.7 * t + 0.4) + 0.01 * Math.sin(2 * Math.PI * 5.3 * t);
  const est = (t: number) => soc(t) + 0.16 * Math.exp(-4.5 * t) * Math.cos(2 * Math.PI * 1.1 * t) + 0.01 * Math.sin(2 * Math.PI * 9 * t + 1);
  const x = (t: number) => t * (W - padR);
  const y = (v: number) => 14 + (1 - v) * (H - 28);
  const path = (f: (t: number) => number) => Array.from({ length: N + 1 }, (_, i) => `${i ? "L" : "M"}${x(i / N).toFixed(1)} ${y(f(i / N)).toFixed(1)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} aria-hidden className={className}>
      <path d={path(soc)} fill="none" stroke="#fff" strokeOpacity="0.35" strokeWidth="1.6" vectorEffect="non-scaling-stroke" />
      <path d={path(est)} fill="none" stroke="#FDBF57" strokeOpacity="0.7" strokeWidth="1.6" vectorEffect="non-scaling-stroke" />
      <g fontFamily="Arial, sans-serif" fontSize="10" fillOpacity="0.7">
        <text x={x(1) + 8} y={y(soc(1)) + 3} fill="#fff">reference SOC</text>
        <text x={x(1) + 8} y={y(est(1)) + (Math.abs(est(1) - soc(1)) < 0.06 ? 14 : 3)} fill="#FDBF57">estimate</text>
      </g>
    </svg>
  );
}
