import { Activity, PauseCircle } from "lucide-react";
import { getEvaluatorStatus, ago, type EvaluatorStatus } from "@/lib/worker-status";
import { cn } from "@/lib/utils";

/**
 * Server component: evaluator health for the Submit page, per package runtime.
 * Workers declare what they can run (WORKER_RUNTIMES), so Python and MATLAB
 * availability can differ — e.g. the Alliance VM (Python) online while the lab
 * machine with MATLAB is off. "Offline" is a normal state — submissions queue
 * and start automatically when a capable worker returns.
 */
export async function EvaluatorStatusLine({ className }: { className?: string }) {
  const [py, ml] = await Promise.all([getEvaluatorStatus("python"), getEvaluatorStatus("matlab")]);
  return (
    <div className={cn("space-y-1 text-sm", className)} aria-live="polite">
      <Line label="Python packages" s={py} />
      <Line label="MATLAB packages" s={ml} />
    </div>
  );
}

function Line({ label, s }: { label: string; s: EvaluatorStatus }) {
  const backlog = s.queued + s.running;
  return (
    <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
      {s.online ? <Activity className="size-4 text-forest" aria-hidden /> : <PauseCircle className="size-4 text-[#9a6a17]" aria-hidden />}
      <span className="font-heading font-medium text-ink">{label}: evaluator {s.online ? "online" : "paused"}</span>
      <span className="text-grey-700">
        {s.online ? (
          <>
            {s.workers.length > 1 ? `${s.workers.length} machines · ` : ""}
            {s.running ? `evaluating ${s.running} now` : "idle"}
            {s.queued ? ` · ${s.queued} queued` : ""}
            {s.running >= s.capacity ? " · new submissions start after those finish" : " · new submissions start within seconds"}
          </>
        ) : (
          <>last seen {ago(s.lastSeenAt)}{backlog ? ` · ${backlog} waiting` : ""} · submissions queue and run automatically, in order, when a machine that can run them is back; you will be e-mailed.</>
        )}
      </span>
    </p>
  );
}
