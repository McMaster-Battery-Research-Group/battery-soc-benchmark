/**
 * Decorative SOC trace for the homepage hero: a cell charging (white, the reference SOC) and an
 * estimator that starts from a wrong initial SOC and converges onto it (gold). It rises left to
 * right so the low end sits under the copy and the high end behind the leaderboard card.
 * Pure SVG, deterministic, no data; it is only there to say "battery state of charge" at a glance.
 */
export function HeroTrace({ className }: { className?: string }) {
  const W = 1200, H = 320, N = 240;
  const soc = (t: number) => 12 + 80 * t + 2.2 * Math.sin(2 * Math.PI * 5.5 * t) + 0.9 * Math.sin(2 * Math.PI * 16 * t + 1) + 1.5 * Math.max(0, Math.sin(2 * Math.PI * 2.3 * t + 0.6)) ** 6;
  const est = (t: number) => soc(t) - 9 * Math.exp(-7 * t) + 0.5 * Math.sin(2 * Math.PI * 29 * t + 2) * (0.4 + 0.6 * Math.exp(-2 * t));
  const x = (i: number) => (i / N) * W;
  const y = (v: number) => H - 24 - (v / 100) * (H - 60);
  const path = (f: (t: number) => number) => Array.from({ length: N + 1 }, (_, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(f(i / N)).toFixed(1)}`).join(" ");
  const ref = path(soc);
  const grid = [100, 75, 50, 25, 0];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden className={className}>
      {grid.map((g) => <line key={g} x1="0" x2={W} y1={y(g)} y2={y(g)} stroke="#fff" strokeOpacity="0.08" strokeWidth="1" />)}
      {/* area under the reference */}
      <path d={`${ref} L${W} ${y(0)} L0 ${y(0)} Z`} fill="#fff" fillOpacity="0.045" />
      {/* reference SOC */}
      <path d={ref} fill="none" stroke="#fff" strokeOpacity="0.32" strokeWidth="2" vectorEffect="non-scaling-stroke" />
      {/* estimate: wrong start, then locked on */}
      <path d={path(est)} fill="none" stroke="#FDBF57" strokeOpacity="0.75" strokeWidth="2.5" strokeDasharray="6 5" vectorEffect="non-scaling-stroke" />
      <g fontFamily="Arial, sans-serif" fontSize="11" fill="#fff" fillOpacity="0.5" textAnchor="end">
        <text x={W - 10} y={y(100) - 6}>SOC 100 %</text>
        <text x={W - 10} y={y(0) - 6}>0 %</text>
      </g>
    </svg>
  );
}
