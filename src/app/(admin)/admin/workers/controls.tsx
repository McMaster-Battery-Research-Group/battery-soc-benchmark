"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Pause, Play, Power, Trash2, Unlock, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { workerCommandAction, forgetWorkerAction, releaseJobAction, retryJobAction } from "../actions";

function useRun() {
  const { push } = useToast();
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const run = (fn: () => Promise<unknown>, ok: string) =>
    start(async () => {
      try {
        await fn();
        push({ kind: "success", title: ok });
        router.refresh();
      } catch (e) {
        // A server action that redirect()s throws a NEXT_REDIRECT sentinel: let Next handle it, it is not a failure.
        if (typeof (e as { digest?: unknown })?.digest === "string" && String((e as { digest: string }).digest).startsWith("NEXT_REDIRECT")) throw e;
        push({ kind: "error", title: "Action failed", description: e instanceof Error ? e.message : String(e) });
      }
    });
  return { run, pending };
}

export function WorkerControls({ id, paused, online }: { id: string; paused: boolean; online: boolean }) {
  const { run, pending } = useRun();
  return (
    <div className="flex shrink-0 flex-wrap gap-2">
      {online ? (
        <>
          {paused ? (
            <Button size="sm" variant="secondary" disabled={pending} onClick={() => run(() => workerCommandAction(id, "resume"), "Resume queued — takes effect at the next heartbeat")}><Play /> Resume</Button>
          ) : (
            <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => workerCommandAction(id, "pause"), "Pause queued — finishes current work, claims nothing new")}><Pause /> Pause</Button>
          )}
          <Button size="sm" variant="outline" disabled={pending} onClick={() => confirm("Stop this worker process after it finishes its current work? Someone must restart it on that machine.") && run(() => workerCommandAction(id, "stop"), "Stop queued")}><Power /> Stop</Button>
        </>
      ) : (
        <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => forgetWorkerAction(id), "Worker removed from the list")}><Trash2 /> Forget</Button>
      )}
    </div>
  );
}

export function JobControls({ submissionId, status }: { submissionId: string; status: string }) {
  const { run, pending } = useRun();
  if (status === "RUNNING") {
    return <Button size="sm" variant="outline" disabled={pending} onClick={() => confirm("Release this lock? Only do this if the worker that holds it is dead — otherwise two machines will evaluate the same model.") && run(() => releaseJobAction(submissionId), "Lock released — back in the queue")}><Unlock /> Release lock</Button>;
  }
  if (status === "FAILED") {
    return <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => retryJobAction(submissionId), "Re-queued with fresh attempts")}><RotateCcw /> Retry</Button>;
  }
  return null;
}

/** Re-fetches server data on an interval so the page stays live without a websocket. */
export function AutoRefresh({ seconds }: { seconds: number }) {
  const router = useRouter();
  React.useEffect(() => {
    const t = setInterval(() => router.refresh(), seconds * 1000);
    return () => clearInterval(t);
  }, [router, seconds]);
  return null;
}

export { LogView } from "@/components/log-view";
