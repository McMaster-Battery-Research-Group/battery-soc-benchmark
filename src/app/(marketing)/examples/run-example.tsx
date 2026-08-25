"use client";

import * as React from "react";
import Link from "next/link";
import { Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/misc";
import { DryRunResult, useDryRunPoll } from "@/components/dry-run-result";
import { DryRunQuotaLine } from "@/components/dry-run-quota";
import { runExampleAction } from "./actions";

/** "Run this example" — queues a dry run of the shipped package for the chosen runtime. */
export function RunExample({ slug, runtime, modelName, signedIn }: { slug: string; runtime: "matlab" | "python"; modelName: string; signedIn: boolean }) {
  const [id, setId] = React.useState<string | null>(null);
  const [err, setErr] = React.useState<string | null>(null);
  const [busy, start] = React.useTransition();
  const [attempts, setAttempts] = React.useState(0);
  const poll = useDryRunPoll(id);
  const running = !!id && (!poll || poll.status === "QUEUED" || poll.status === "RUNNING");

  const run = () =>
    start(async () => {
      setErr(null);
      setId(null);
      const res = await runExampleAction(slug, runtime);
      if (res.ok) setId(res.id);
      else setErr(res.error);
      setAttempts((a) => a + 1);
    });

  return (
    <div className="card p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-heading font-semibold text-ink">See it evaluated</p>
          <p className="text-sm text-grey-700">Queues a dry run of the shipped <strong>{runtime === "matlab" ? "MATLAB" : "Python"}</strong> package on one public cycle — the same check you get for your own model. Counts toward your 5 test runs per hour.</p>
          {signedIn ? <DryRunQuotaLine refreshKey={attempts} className="mt-1" /> : null}
        </div>
        {signedIn ? (
          <Button variant="secondary" onClick={run} disabled={busy || running} loading={busy || running}><Play /> Run this example</Button>
        ) : (
          <Button asChild variant="secondary"><Link href="/login?next=/examples">Sign in to run it</Link></Button>
        )}
      </div>
      {err ? <Alert variant="danger" className="mt-3">{err}</Alert> : null}
      <DryRunResult id={id} poll={poll} modelName={modelName} footer={<>Now try changing something and submitting your own version.</>} />
    </div>
  );
}
