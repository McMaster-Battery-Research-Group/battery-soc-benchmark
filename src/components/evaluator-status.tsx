import { Activity, PauseCircle } from "lucide-react";
import { getEvaluatorStatus, ago } from "@/lib/worker-status";
import { cn } from "@/lib/utils";

/**
 * Server component: one-line evaluator health for the Submit page. The worker
 * runs on a lab machine, so "offline" is a normal state — submissions queue
 * and start automatically when it returns.
 */
export async function EvaluatorStatusLine({ className }: { className?: string }) {
  const s = await getEvaluatorStatus();
  const backlog = s.queued + s.running;
  return (
    <p className={cn("flex flex-wrap items-center gap-x-2 gap-y-1 text-sm", className)} aria-live="polite">
      {s.online ? (
        <>
          <Activity className="size-4 text-forest" aria-hidden />
          <span className="font-heading font-medium text-ink">Evaluator online</span>
          <span className="text-grey-700">
            {s.workers.length > 1 ? `${s.workers.length} machines · ` : ""}
            {s.running ? `evaluating ${s.running} now` : "idle"}
            {s.queued ? ` · ${s.queued} queued` : ""}
            {s.running >= s.capacity ? " · new submissions start after those finish (≈30–60 min each for a full run)" : " · new submissions start within seconds"}
          </span>
        </>
      ) : (
        <>
          <PauseCircle className="size-4 text-[#9a6a17]" aria-hidden />
          <span className="font-heading font-medium text-ink">Evaluator paused</span>
          <span className="text-grey-700">
            last seen {ago(s.lastSeenAt)}{backlog ? ` · ${backlog} waiting` : ""}. You can still submit and test — everything queues and runs automatically, in order, as soon as the evaluation machine is back; you will be e-mailed with the results.
          </span>
        </>
      )}
    </p>
  );
}
