import { cn } from "@/lib/utils";

/**
 * Rank medal. `ghost` marks a viewer-only private submission: it shows the
 * position it WOULD take among the public rows ("~16") without displacing them.
 */
export function RankBadge({ rank, ghost = false, className }: { rank: number; ghost?: boolean; className?: string }) {
  if (ghost) {
    return (
      <span className={cn("inline-flex h-8 min-w-8 items-center justify-center rounded-full border border-dashed border-grey-400 px-1.5 font-heading text-xs font-semibold tabular text-grey-600", className)} aria-label={`Would rank ${rank} if public`} title="Private — would rank here if made public">
        ~{rank}
      </span>
    );
  }
  const styles =
    rank === 1
      ? "bg-gold text-ink ring-2 ring-gold-300"
      : rank === 2
        ? "bg-grey-300 text-grey-900"
        : rank === 3
          ? "bg-[#d9a066] text-white"
          : "bg-transparent text-grey-700";
  return (
    <span className={cn("inline-flex size-8 items-center justify-center rounded-full font-heading text-sm font-semibold tabular", styles, className)} aria-label={`Rank ${rank}`}>
      {rank}
    </span>
  );
}
