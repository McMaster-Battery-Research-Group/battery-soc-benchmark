"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { FlaskConical, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Label, Hint } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { startLoadTestAction, clearLoadTestsAction } from "./load-test";

const EXAMPLES = [
  { slug: "coulomb-counter", label: "Coulomb counter — fastest, finishes in seconds" },
  { slug: "ekf", label: "Extended Kalman filter" },
  { slug: "fnn", label: "Feedforward neural network" },
  { slug: "lstm", label: "LSTM — heaviest, about an hour" },
];

/**
 * Queues several copies of one example at once, to test the evaluation host at a chosen
 * concurrency. Submitting by hand drifts — the first run finishes before the last is queued —
 * so every copy here is created together and the worker claims them as a batch.
 */
export function LoadTestCard({ concurrency }: { concurrency: number }) {
  const router = useRouter();
  const { push } = useToast();
  const [pending, start] = React.useTransition();
  const [slug, setSlug] = React.useState("coulomb-counter");
  const [runtime, setRuntime] = React.useState<"python" | "matlab">("python");
  const [copies, setCopies] = React.useState(concurrency);

  const run = () =>
    start(async () => {
      const res = await startLoadTestAction(slug, runtime, copies);
      if (!res.ok) return push({ kind: "error", title: "Could not start the test", description: res.error });
      push({ kind: "success", title: `Queued ${res.seqs.length} evaluations`, description: `#${res.seqs.join(", #")}` });
      router.refresh();
    });

  const clear = () =>
    start(async () => {
      const res = await clearLoadTestsAction();
      if (!res.ok) return push({ kind: "error", title: "Could not clear", description: res.error });
      push({ kind: "success", title: `Removed ${res.removed} load-test submission${res.removed === 1 ? "" : "s"}` });
      router.refresh();
    });

  return (
    <section className="card mt-4 p-5">
      <h3 className="font-heading text-base font-semibold">Concurrency test</h3>
      <p className="mt-1 max-w-prose text-sm text-grey-600">
        Queues several copies of one bundled example in a single batch, so they start together and the resource charts
        show the machine under genuine parallel load. The copies are private and hidden, and never reach the
        leaderboard.
      </p>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <span>
          <Label htmlFor="lt-example">Example</Label>
          <select
            id="lt-example"
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            className="mt-1 h-10 w-full rounded-brand border border-border bg-white px-3 text-sm text-ink"
          >
            {EXAMPLES.map((e) => (
              <option key={e.slug} value={e.slug}>
                {e.label}
              </option>
            ))}
          </select>
        </span>
        <span>
          <Label htmlFor="lt-runtime">Runtime</Label>
          <select
            id="lt-runtime"
            value={runtime}
            onChange={(e) => setRuntime(e.target.value as "python" | "matlab")}
            className="mt-1 h-10 w-full rounded-brand border border-border bg-white px-3 text-sm text-ink"
          >
            <option value="python">Python — light, about 270 MB</option>
            <option value="matlab">MATLAB — about 1.1 GB</option>
          </select>
        </span>
        <span>
          <Label htmlFor="lt-copies">Copies</Label>
          <input
            id="lt-copies"
            type="number"
            min={1}
            max={12}
            value={copies}
            onChange={(e) => setCopies(Math.max(1, Math.min(12, Number(e.target.value) || 1)))}
            className="mt-1 h-10 w-full rounded-brand border border-border bg-white px-3 text-sm tabular text-ink"
          />
        </span>
      </div>
      <Hint>
        The worker runs {concurrency} at a time. Queue more than that to see the queue drain; queue exactly that many to
        measure the machine at full load.
      </Hint>

      <div className="mt-3 flex flex-wrap gap-2">
        <Button onClick={run} disabled={pending}>
          <FlaskConical /> Queue {copies} evaluation{copies === 1 ? "" : "s"}
        </Button>
        <Button variant="outline" onClick={clear} disabled={pending}>
          <Trash2 /> Delete all load tests
        </Button>
      </div>
    </section>
  );
}
