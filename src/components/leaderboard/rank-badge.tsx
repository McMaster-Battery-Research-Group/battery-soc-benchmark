import { cn } from "@/lib/utils";

/**
 * Rank medal. `ghost` marks a viewer-only private submission: it shows the
 * position it WOULD take among the public rows ("~16") without displacing them.
 */
export function RankBadge({ rank, ghost = false, unranked = false, className }: { rank: number; ghost?: boolean; unranked?: boolean; className?: string }) {
  if (unranked) {
    return (
      <span className={cn("inline-flex size-8 items-center justify-center rounded-full border border-dashed border-[#f2dcb6] bg-[#fdf4e3] font-heading text-xs font-semibold text-[#7a4f0e]", className)} aria-label="Unranked, legacy scoring" title="Scored by an older benchmark version; unranked until re-submitted">
        —
      </span>
    );
  }
  if (ghost) {
    return (
      <span className={cn("inline-flex h-8 min-w-8 items-center justify-center rounded-full border border-dashed border-grey-400 px-1.5 font-heading text-xs font-semibold tabular text-grey-600", className)} aria-label={`Would rank ${rank} if public`} title="Private; would rank here if made public">
        ~{rank}
      </span>
    );
  }
  const medal = MEDALS[rank];
  if (medal) {
    return (
      <span className={cn("relative inline-block size-8 shrink-0", className)} role="img" aria-label={`Rank ${rank} (${medal.name} medal)`} title={`${medal.name} medal`}>
        {/* ribbon: two straps meeting behind the disc */}
        <svg viewBox="0 0 32 32" className="absolute inset-0 size-8" aria-hidden>
          <path d="M9 0h6l4 14h-6z" fill="#7A003C" stroke="#fff" strokeWidth="0.75" />
          <path d="M23 0h-6l-4 14h6z" fill="#a8325f" stroke="#fff" strokeWidth="0.75" />
        </svg>
        <span
          className="absolute bottom-0 left-1/2 flex size-[22px] -translate-x-1/2 items-center justify-center rounded-full font-heading text-[11px] font-bold tabular"
          style={{ background: medal.face, color: medal.text, boxShadow: `inset 0 0 0 1.5px ${medal.rim}, inset 0 0 0 3px rgb(255 255 255 / 0.35), 0 1px 2px rgb(0 0 0 / 0.25)` }}
        >
          {rank}
        </span>
      </span>
    );
  }
  return (
    <span className={cn("inline-flex size-8 items-center justify-center rounded-full font-heading text-sm font-semibold tabular text-grey-700", className)} aria-label={`Rank ${rank}`}>
      {rank}
    </span>
  );
}

/** Metallic faces for the podium places: a light-to-dark sheen, a darker rim and legible text. */
const MEDALS: Record<number, { name: string; face: string; rim: string; text: string }> = {
  1: { name: "Gold", face: "linear-gradient(145deg, #fff1c4 0%, #fdbf57 45%, #c48a2a 100%)", rim: "#a8741c", text: "#4a3000" },
  2: { name: "Silver", face: "linear-gradient(145deg, #ffffff 0%, #cfd3d8 45%, #8f969e 100%)", rim: "#7b828a", text: "#1f262b" },
  3: { name: "Bronze", face: "linear-gradient(145deg, #f6d2ae 0%, #d39260 45%, #9a5a2c 100%)", rim: "#81481f", text: "#2e1606" },
};
