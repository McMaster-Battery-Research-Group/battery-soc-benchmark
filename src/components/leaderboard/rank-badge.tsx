import { cn } from "@/lib/utils";

export function RankBadge({ rank, className }: { rank: number; className?: string }) {
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
