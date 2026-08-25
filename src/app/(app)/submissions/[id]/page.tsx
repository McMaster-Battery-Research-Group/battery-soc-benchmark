import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Lock, ArrowLeft, Trophy, Download } from "lucide-react";
import { auth } from "@/lib/auth";
import { getSubmissionDetail, canViewSubmission } from "@/lib/queries";
import { TEST_CASES, MODEL_TYPE_LABELS, COMPLEXITY_LABELS, type MetricKey } from "@/lib/test-cases";
import { fmtPct, fmtDateTime, fmtBytes } from "@/lib/utils";
import type { PerCycleRow, TimeSeriesTrace } from "@/evaluator/types";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert, Stat } from "@/components/ui/misc";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TestCaseBars } from "@/components/charts/test-case-bars";
import { TemperatureBars } from "@/components/charts/temperature-bars";
import { SocTracePicker } from "@/components/charts/soc-trace";
import { PerCycleTable } from "@/components/charts/per-cycle-table";
import { ModelSchematic, specForModelType } from "@/components/model-schematic";
import { StatusPoller } from "./status-poller";
import { OwnerActions } from "./owner-actions";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const sub = await getSubmissionDetail((await params).id);
  return { title: sub ? sub.modelName : "Submission" };
}

export default async function SubmissionPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ new?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const [session, sub] = await Promise.all([auth(), getSubmissionDetail(id)]);
  if (!sub || !canViewSubmission(sub, session?.user)) notFound();
  const isOwner = session?.user?.id === sub.userId;
  const isAdmin = session?.user?.role === "ADMIN";
  const r = sub.result;
  const values = r ? (Object.fromEntries(TEST_CASES.map((t) => [t.key, r[t.key as keyof typeof r] as number])) as Record<MetricKey, number>) : null;

  return (
    <div className="container-site py-8">
      <Link href={isOwner ? "/submissions" : "/leaderboard"} className="inline-flex items-center gap-1 text-sm text-maroon hover:underline">
        <ArrowLeft className="size-4" /> {isOwner ? "My submissions" : "Leaderboard"}
      </Link>

      <div className="mt-4 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-heading text-3xl font-bold">{sub.modelName}</h1>
            <StatusBadge status={sub.status} />
            {sub.isPrivate ? <Badge variant="neutral"><Lock className="size-3" /> Private</Badge> : null}
            {sub.contest ? <Badge variant="gold"><Trophy className="size-3" /> {sub.contest.title}</Badge> : null}
          </div>
          <p className="mt-1 text-sm text-grey-700">
            Submission #{sub.seq} · {MODEL_TYPE_LABELS[sub.modelType]} · by <span className="text-ink">{sub.user.name}</span>, {sub.user.affiliation} · {fmtDateTime(sub.submittedAt)}
          </p>
          <p className="mt-3 max-w-3xl text-[15px] leading-relaxed text-grey-800">{sub.description}</p>
        </div>
        {(isOwner || isAdmin) ? <OwnerActions id={sub.id} status={sub.status} isPrivate={sub.isPrivate} isHidden={sub.isHidden} isAdmin={isAdmin} inContest={!!sub.contestId} /> : null}
      </div>

      {sp.new ? <Alert variant="success" className="mt-6" title="Submission received">Your package passed the structural checks and is queued for blinded evaluation. This page updates automatically; you will also receive an email when it finishes.</Alert> : null}

      {sub.status === "QUEUED" || sub.status === "RUNNING" ? (
        <div className="mt-6"><StatusPoller id={sub.id} status={sub.status} log={isOwner || isAdmin ? sub.job?.log ?? "" : ""} /></div>
      ) : null}

      {sub.status === "FAILED" ? (
        <Alert variant="danger" className="mt-6" title="Evaluation failed">
          <p>{sub.failureMessage}</p>
          {(isOwner || isAdmin) && sub.job?.log ? <pre className="mt-3 max-h-64 overflow-auto rounded-brand bg-grey-900 p-3 text-xs text-white">{sub.job.log}</pre> : null}
          <p className="mt-2 text-xs">Tip: use <Link href="/submit" className="underline">Test your package first</Link> on the Submit page before re-submitting.</p>
        </Alert>
      ) : null}

      {r && values ? (
        <>
          <div className="mt-8 grid grid-cols-2 gap-4 md:grid-cols-4">
            <Stat label="Weighted error" value={<>{fmtPct(r.weightedError)}<span className="text-lg text-grey-600"> %</span></>} sub="Official leaderboard score" />
            <Stat label="All cells RMSE" value={<>{fmtPct(r.allCells)}<span className="text-lg text-grey-600"> %</span></>} sub="Test 1, every blinded cycle" />
            <Stat label="Max error" value={<>{fmtPct(r.maxError, 1)}<span className="text-lg text-grey-600"> %</span></>} sub="Worst instantaneous error" />
            <Stat label="Complexity" value={<>{r.complexity}<span className="text-lg text-grey-600"> ±{r.complexityUncertainty}</span></>} sub={COMPLEXITY_LABELS[r.complexity]} />
          </div>

          <Tabs defaultValue="summary" className="mt-8">
            <TabsList>
              <TabsTrigger value="summary">Summary</TabsTrigger>
              <TabsTrigger value="time">Time-domain</TabsTrigger>
              <TabsTrigger value="cycles">Per-cycle errors</TabsTrigger>
              <TabsTrigger value="details">Details</TabsTrigger>
            </TabsList>
            <TabsContent value="summary" className="grid gap-6 xl:grid-cols-5">
              <div className="xl:col-span-3"><TestCaseBars series={[{ name: sub.modelName, values }]} /></div>
              <div className="xl:col-span-2"><TemperatureBars series={[{ name: sub.modelName, values }]} /></div>
              <div className="card xl:col-span-5">
                <div className="border-b border-border px-5 py-3 font-heading text-[15px] font-semibold text-ink">All test cases</div>
                <div className="grid gap-x-8 md:grid-cols-2 lg:grid-cols-3">
                  {TEST_CASES.map((t) => (
                    <div key={t.key} className="flex items-baseline justify-between gap-3 border-b border-border px-5 py-2.5 text-sm">
                      <span className="text-grey-800"><span className="mr-1.5 text-xs text-grey-500">T{t.test}</span>{t.label}</span>
                      <span className="font-heading font-semibold text-ink tabular">{fmtPct(values[t.key])} %</span>
                    </div>
                  ))}
                </div>
              </div>
            </TabsContent>
            <TabsContent value="time">
              <SocTracePicker tracesByModel={[r.timeSeries as unknown as TimeSeriesTrace[]]} names={[sub.modelName]} />
              <p className="mt-3 text-xs text-grey-600">One hour of padded data precedes every cycle in the evaluator and is excluded from the error metrics. Traces are down-sampled for display.</p>
            </TabsContent>
            <TabsContent value="cycles">
              <PerCycleTable rows={r.perCycle as unknown as PerCycleRow[]} modelName={sub.modelName} />
            </TabsContent>
            <TabsContent value="details" className="space-y-4">
              <ModelSchematic spec={specForModelType(sub.modelType)} title={`${MODEL_TYPE_LABELS[sub.modelType]} — standardized view`} />
              <p className="text-xs text-grey-600">The schematic shows the canonical structure for this model family; the author&apos;s description above gives the specific architecture.</p>
              <dl className="card grid gap-x-8 gap-y-3 p-5 text-sm sm:grid-cols-2">
                <Row k="Package" v={`${sub.fileName} (${fmtBytes(sub.fileSize)}) — deleted after evaluation`} />
                <Row k="Evaluation level" v={sub.evaluationLevel.toLowerCase()} />
                <Row k="Evaluator version" v={r.evaluatorVersion} />
                <Row k="Completed" v={fmtDateTime(sub.completedAt)} />
                <Row k="Visibility" v={sub.isPrivate ? "Private (owner only)" : "Public"} />
                <Row k="Submission ID" v={sub.id} />
              </dl>
              <div className="mt-4">
                <Button asChild variant="outline" size="sm"><a href={`/api/submissions/${sub.id}/results`} download><Download /> Download results JSON</a></Button>
              </div>
            </TabsContent>
          </Tabs>
        </>
      ) : null}
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-4 border-b border-border py-2 last:border-0 sm:last:border-b">
      <dt className="text-grey-600">{k}</dt>
      <dd className="text-right text-ink">{v}</dd>
    </div>
  );
}
