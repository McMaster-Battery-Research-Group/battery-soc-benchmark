/**
 * Quiet decoration along the bottom edge of the homepage hero: a reference SOC (white) and an
 * estimate that settles onto it (gold), two smooth lines and nothing else. It lives in the hero's
 * bottom padding, so it never sits behind text.
 */
export function HeroLines({ className }: { className?: string }) {
  const W = 1200, H = 90, N = 160;
  const soc = (t: number) => 0.72 - 0.42 * t + 0.035 * Math.sin(2 * Math.PI * 1.6 * t + 0.4) + 0.012 * Math.sin(2 * Math.PI * 5.1 * t);
  const est = (t: number) => soc(t) + 0.14 * Math.exp(-5 * t) * Math.cos(2 * Math.PI * 1.2 * t) + 0.012 * Math.sin(2 * Math.PI * 9 * t + 1);
  const y = (v: number) => H - 10 - v * (H - 20);
  const path = (f: (t: number) => number) => Array.from({ length: N + 1 }, (_, i) => `${i ? "L" : "M"}${((i / N) * W).toFixed(1)} ${y(f(i / N)).toFixed(1)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden className={className}>
      <path d={path(soc)} fill="none" stroke="#fff" strokeOpacity="0.22" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
      <path d={path(est)} fill="none" stroke="#FDBF57" strokeOpacity="0.5" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
