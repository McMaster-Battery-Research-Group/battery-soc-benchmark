import Link from "next/link";
import { cn } from "@/lib/utils";

/** Site wordmark: a battery-cell glyph + "BatterySOCBenchmark" in Poppins. Own identity, McMaster colours. */
export function Wordmark({ className, inverted = false }: { className?: string; inverted?: boolean }) {
  return (
    <Link href="/" className={cn("inline-flex items-center gap-2.5", className)} aria-label="Battery SOC Benchmark home">
      <CellGlyph className="size-7" inverted={inverted} />
      <span className={cn("font-heading text-[17px] font-semibold tracking-tight", inverted ? "text-white" : "text-ink")}>
        Battery<span className={inverted ? "text-gold" : "text-maroon"}>SOC</span>Benchmark
      </span>
    </Link>
  );
}

export function CellGlyph({ className, inverted = false }: { className?: string; inverted?: boolean }) {
  const stroke = inverted ? "#FFFFFF" : "#7A003C";
  const fill = inverted ? "#FDBF57" : "#7A003C";
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden fill="none">
      <rect x="3" y="9" width="23" height="14" rx="2" stroke={stroke} strokeWidth="2.2" />
      <rect x="27" y="13" width="3" height="6" rx="1" fill={stroke} />
      <rect x="6.5" y="12.5" width="5" height="7" rx="1" fill={fill} />
      <rect x="13" y="12.5" width="5" height="7" rx="1" fill={fill} />
      <rect x="19.5" y="12.5" width="3.5" height="7" rx="1" fill={fill} opacity="0.35" />
    </svg>
  );
}
