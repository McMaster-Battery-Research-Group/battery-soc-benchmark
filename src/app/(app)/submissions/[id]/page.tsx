import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Lock, ArrowLeft, Trophy, Download, FileText, Settings2, ChevronDown } from "lucide-react";
import { auth } from "@/lib/auth";
import { getSubmissionDetail, canViewSubmission, publicRankOf } from "@/lib/queries";
import { getActiveWeights } from "@/lib/scoring-config";
import { TEST_CASES, MODEL_TYPE_LABELS, type MetricKey } from "@/lib/test-cases";
import { fmtPct, fmtDateTime, fmtBytes } from "@/lib/utils";
import type { PerCycleRow, TimeSeriesTrace } from "@/evaluator/types";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/misc";
import { Avatar } from "@/components/avatar";
import { Scorecard } from "@/components/scorecard";
import { TestCaseBars } from "@/components/charts/test-case-bars";
import { TemperatureBars } from "@/components/charts/temperature-bars";
import { SocTracePicker } from "@/components/charts/soc-trace";
import { KeyCases } from "@/components/charts/key-cases";
import { PerCycleTable } from "@/components/charts/per-cycle-table";
import { ModelSchematic, specForModelType } from "@/components/model-schematic";
import * as React from "react";
import { StatusPoller } from "./status-poller";
import { Celebration } from "@/components/celebration";
import { OwnerActions } from "./owner-actions";
import { Collaborators } from "./collaborators";
import { isCurrentBenchmark, BENCHMARK_VERSION } from "@/lib/benchmark-version";
import { getHistory, KIND_LABEL, type RevisionKind } from "@/lib/history";
import { EditDetailsDialog, NewVersionDialog } from "./edit-and-resubmit";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const sub = await getSubmissionDetail((await params).id);
  return { title: sub ? sub.modelName : "Submission" };
}

/**
 * Results page, top to bottom: what you got (scorecard) → why (key cases) → the rest, collapsed
 * (all cycles, charts, score history, model family) → downloads → housekeeping (about, authors).
 * Management actions live in one "Manage" menu so they never compete with the results.
 */
export default async function SubmissionPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ new?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const [session, sub, history, rank, weights] = await Promise.all([auth(), getSubmissionDetail(id), getHistory(id), publicRankOf(id), getActiveWeights()]);
  if (!sub || !canViewSubmission(sub, session?.user)) notFound();
  const isOwner = session?.user?.id === sub.userId;
  const isAdmin = session?.user?.role === "ADMIN";
  const isCollaborator = !!session?.user && sub.collaborators.some((c) => c.userId === session.user.id);
  const canSee = isOwner || isAdmin || isCollaborator; // logs, report link
  const canManage = isOwner || isAdmin;
  const toPerson = (u: { id: string; name: string; affiliation: string; avatarUpdatedAt: Date | null }) => ({ id: u.id, name: u.name, affiliation: u.affiliation, avatarVersion: u.avatarUpdatedAt?.getTime() ?? null });
  const r = sub.result;
  const values = r ? (Object.fromEntries(TEST_CASES.map((t) => [t.key, r[t.key as keyof typeof r] as number])) as Record<MetricKey, number>) : null;
  const authors = [sub.user, ...sub.collaborators.filter((c) => c.acceptedAt).map((c) => c.user)];
  const legacy = r ? !isCurrentBenchmark(r.evaluatorVersion) : false;
  const traces = (r?.timeSeries ?? []) as unknown as TimeSeriesTrace[];

  return (
    <div className="container-site py-8">
      <Link href={isOwner ? "/submissions" : "/leaderboard"} className="inline-flex items-center gap-1 text-sm text-maroon hover:underline">
        <ArrowLeft className="size-4" /> {isOwner ? "My submissions" : "Leaderboard"}
      </Link>

      {/* ---------- header: identity + score in one glance; management folded away */}
      <header className="mt-4 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-heading text-3xl font-bold">{sub.modelName}</h1>
            <StatusBadge status={sub.status} />
            {sub.isPrivate ? <Badge variant="neutral"><Lock className="size-3" /> Private</Badge> : null}
            {legacy ? <Badge variant="gold">Legacy scoring · unranked</Badge> : null}
            {sub.contest ? <Badge variant="gold"><Trophy className="size-3" /> {sub.contest.title}</Badge> : null}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-grey-700">
            {r ? (
              <span className="inline-flex items-baseline gap-1.5">
                <span className="font-heading text-2xl font-bold tabular text-ink">{fmtPct(r.weightedError)} %</span>
                <span>weighted error</span>
              </span>
            ) : null}
            {rank ? (
              <Link href="/leaderboard" className="inline-flex items-center gap-1.5 rounded-full border border-gold-400 bg-gold-100 px-2.5 py-0.5 font-heading text-sm font-semibold text-ink hover:bg-gold-200" title="Current position on the public leaderboard (by weighted error)">
                <Trophy className="size-3.5 text-maroon" /> Rank #{rank}
              </Link>
            ) : null}
            <span>#{sub.seq}{sub.version > 1 ? ` · v${sub.version}` : ""} · {MODEL_TYPE_LABELS[sub.modelType]} · {fmtDateTime(sub.submittedAt)}</span>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <div className="flex -space-x-2">
              {authors.map((u) => (
                <Link key={u.id} href={`/users/${u.id}`} title={u.name} className="rounded-full ring-2 ring-white">
                  <Avatar userId={u.id} name={u.name} hasAvatar={!!u.avatarUpdatedAt} version={u.avatarUpdatedAt?.getTime() ?? null} size={28} />
                </Link>
              ))}
            </div>
            <span className="text-sm text-grey-700">
              {authors.map((u, i) => (
                <React.Fragment key={u.id}>{i ? ", " : ""}<Link href={`/users/${u.id}`} className="text-ink hover:text-maroon hover:underline">{u.name}</Link></React.Fragment>
              ))}
              {authors.length === 1 ? ` · ${sub.user.affiliation}` : ""}
            </span>
          </div>
        </div>

        {canManage ? (
          <details className="group relative shrink-0">
            <summary className="inline-flex cursor-pointer list-none items-center gap-2 rounded-brand border border-border bg-white px-3 py-2 font-heading text-sm font-medium text-grey-900 hover:bg-grey-100 [&::-webkit-details-marker]:hidden">
              <Settings2 className="size-4" /> Manage <ChevronDown className="size-4 text-grey-500 transition-transform group-open:rotate-180" />
            </summary>
            <div className="absolute right-0 z-20 mt-2 w-max min-w-64 rounded-brand border border-border bg-white p-3 shadow-lg">
              <div className="flex flex-col items-stretch gap-2 [&_button]:w-full [&_button]:justify-start">
                <EditDetailsDialog id={sub.id} modelName={sub.modelName} description={sub.description} modelType={sub.modelType} locked={!!sub.contest && sub.contest.status !== "OPEN"} />
                {sub.status === "COMPLETED" || sub.status === "FAILED" ? (
                  <NewVersionDialog id={sub.id} version={sub.version} directUpload={(process.env.STORAGE ?? "local") === "supabase"} maxMb={Number(process.env.MAX_UPLOAD_MB ?? 50)} disabledReason={sub.contest && sub.contest.status !== "OPEN" ? "Contest closed — its entries are frozen. Submit a new (non-contest) submission instead." : undefined} />
                ) : null}
                <div className="my-1 h-px bg-border" />
                <OwnerActions id={sub.id} status={sub.status} isPrivate={sub.isPrivate} isHidden={sub.isHidden} isAdmin={isAdmin} isOwner={isOwner} inContest={!!sub.contestId} cancelRequested={!!sub.job?.cancelRequestedAt} />
              </div>
            </div>
          </details>
        ) : null}
      </header>

      {/* ---------- transient states */}
      {sp.new ? <Alert variant="success" className="mt-6" title="Submission received">Your package passed the package checks and is queued for blinded evaluation. This page updates automatically; you will also receive an email when it finishes.</Alert> : null}
      {sub.status === "QUEUED" || sub.status === "RUNNING" ? (
        <div className="mt-6"><StatusPoller id={sub.id} status={sub.status} log={canSee ? sub.job?.log ?? "" : ""} /></div>
      ) : null}
      {sub.status === "COMPLETED" && r && (isOwner || isCollaborator) ? (
        <Celebration id={sub.id} modelName={sub.modelName} score={fmtPct(r.weightedError)} rank={rank} recentlyCompleted={!!sub.completedAt && Date.now() - sub.completedAt.getTime() < 14 * 86400_000} />
      ) : null}
      {sub.status === "FAILED" ? (
        <Alert variant="danger" className="mt-6" title="Evaluation failed">
          <p>{sub.failureMessage}</p>
          {canSee && sub.job?.log ? <pre className="mt-3 max-h-64 overflow-auto rounded-brand bg-grey-900 p-3 text-xs text-white">{sub.job.log}</pre> : null}
          <p className="mt-2 text-xs">Tip: use <Link href="/submit" className="underline">Test your package first</Link> on the Submit page before re-submitting. Think the evaluator is wrong? <Link href={`/contact?category=bug&subject=${encodeURIComponent(`Submission #${sub.seq} failed`)}&from=/submissions/${sub.id}`} className="underline">Tell us</Link>.</p>
        </Alert>
      ) : null}

      {r && values ? (
        <div className="mt-6 space-y-6">
          {/* 1. what you got */}
          <Scorecard values={values} weights={weights} weightedError={r.weightedError} complexity={r.complexity} complexityUncertainty={r.complexityUncertainty} maxError={r.maxError} />

          {/* 2. why */}
          <section>
            <h2 className="font-heading text-lg font-semibold text-ink">Key cases</h2>
            <p className="mb-3 mt-1 text-sm text-grey-700">The runs that separate estimators — cold and hot cycles, the blinded cell, wrong initial SOC, a biased current sensor. Each plot says why it is there.</p>
            <KeyCases traces={traces} modelName={sub.modelName} />
          </section>

          {/* 3. the rest, collapsed */}
          <Fold title="Test-case charts" sub="The scorecard as bar charts — tests 1–8, and RMSE against temperature (test 9).">
            <div className="grid gap-6 xl:grid-cols-5">
              <div className="xl:col-span-3"><TestCaseBars series={[{ name: sub.modelName, values }]} /></div>
              <div className="xl:col-span-2"><TemperatureBars series={[{ name: sub.modelName, values }]} /></div>
            </div>
          </Fold>
          <Fold title="All 144 cycles" sub="Every blinded drive cycle: per-cycle errors, and any of the plotted cycles in the time domain.">
            <PerCycleTable rows={r.perCycle as unknown as PerCycleRow[]} modelName={sub.modelName} />
            <div className="mt-6">
              <SocTracePicker tracesByModel={[traces.filter((t) => (t.group ?? "cycle") === "cycle")]} names={[sub.modelName]} />
              <p className="mt-3 text-xs text-grey-600">One hour of padded data precedes every cycle in the evaluator and is excluded from the error metrics. Charts are down-sampled for display (peaks preserved); the full 1 Hz data is in the traces download below.</p>
            </div>
          </Fold>
          {history.length ? (
            <Fold title="Score history" sub="Every evaluation attempt and every change to how this submission is scored; the current score is the last row.">
              <ol className="divide-y divide-border text-sm">
                {history.map((h, i) => {
                  const prev = history.slice(0, i).reverse().find((p) => p.weightedError !== null)?.weightedError ?? null;
                  const delta = h.weightedError !== null && prev !== null ? h.weightedError - prev : null;
                  return (
                    <li key={h.id} className="grid gap-1 py-2 sm:grid-cols-[170px_1fr_140px]">
                      <span className="text-grey-700">{fmtDateTime(h.createdAt)}</span>
                      <span>
                        <span className="font-heading font-medium text-ink">{KIND_LABEL[h.kind as RevisionKind] ?? h.kind}</span>
                        <span className="text-grey-600"> · {h.evaluatorVersion.split("/")[0]}</span>
                        {h.note ? <span className="block text-xs text-grey-600">{h.note}</span> : null}
                      </span>
                      <span className="tabular sm:text-right">
                        {h.weightedError === null ? <span className="text-danger">failed</span> : <><span className="font-heading font-semibold text-ink">{fmtPct(h.weightedError)} %</span>{delta !== null && Math.abs(delta) > 0.0005 ? <span className={`ml-1 text-xs ${delta < 0 ? "text-forest" : "text-danger"}`}>({delta > 0 ? "+" : ""}{delta.toFixed(3)})</span> : null}</>}
                      </span>
                    </li>
                  );
                })}
              </ol>
            </Fold>
          ) : null}
          <Fold title={`How a ${MODEL_TYPE_LABELS[sub.modelType].toLowerCase()} works`} sub="The canonical structure for this model family; the author's description below gives the specific architecture.">
            <ModelSchematic spec={specForModelType(sub.modelType)} title={`${MODEL_TYPE_LABELS[sub.modelType]} — standardized view`} />
          </Fold>

          {/* 4. downloads, once */}
          <section className="card flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="font-heading font-semibold text-ink">Downloads</h2>
              <p className="text-sm text-grey-700">
                PDF report (summary, every test case with the arithmetic, key plots, per-cycle table) · results as JSON ·{" "}
                {r.tracesKey ? "full 1 Hz traces of all 195 runs as a MATLAB v7 file (0.01 % SOC steps; readable with scipy.io.loadmat, see the readme variable inside)" : "full-resolution traces are stored for evaluations from 2026-08-30 onward — submit a new version to get them"}.
              </p>
            </div>
            <div className="flex shrink-0 flex-wrap gap-2">
              <Button asChild variant="secondary" size="sm"><a href={`/api/submissions/${sub.id}/report.pdf`} target="_blank" rel="noreferrer"><FileText /> PDF report</a></Button>
              <Button asChild variant="outline" size="sm"><a href={`/api/submissions/${sub.id}/results`} download><Download /> JSON</a></Button>
              {r.tracesKey ? <Button asChild variant="outline" size="sm"><a href={`/api/submissions/${sub.id}/traces`} download><Download /> Traces (.mat)</a></Button> : null}
            </div>
          </section>
        </div>
      ) : null}

      {/* 5. housekeeping */}
      <section className="mt-6 card p-5">
        <h2 className="font-heading font-semibold text-ink">About this submission</h2>
        <p className="mt-2 max-w-3xl text-[15px] leading-relaxed text-grey-800">{sub.description}</p>
        <dl className="mt-4 grid gap-x-8 gap-y-2 text-sm sm:grid-cols-2">
          <Row k="Package" v={`${sub.fileName} (${fmtBytes(sub.fileSize)}) — deleted after evaluation`} />
          <Row k="Visibility" v={sub.isPrivate ? "Private (owner only)" : "Public"} />
          {r ? <Row k="Evaluator" v={`${r.evaluatorVersion}${legacy ? ` — legacy; current benchmark is ${BENCHMARK_VERSION}. Kept for reference, unranked until a new version is submitted.` : ""}`} /> : null}
          {sub.completedAt ? <Row k="Completed" v={fmtDateTime(sub.completedAt)} /> : null}
          <Row k="Submission ID" v={sub.id} />
        </dl>
      </section>
      <Collaborators submissionId={sub.id} owner={toPerson(sub.user)} list={sub.collaborators.map((c) => ({ ...toPerson(c.user), notified: !!c.notifiedAt, accepted: !!c.acceptedAt }))} canEdit={canManage} viewerId={session?.user?.id} />
    </div>
  );
}

/** Collapsed section (native <details>, no JS): title + one-line summary; opens in place. */
function Fold({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <details className="group card">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 [&::-webkit-details-marker]:hidden">
        <span>
          <span className="font-heading text-[15px] font-semibold text-ink">{title}</span>
          {sub ? <span className="mt-0.5 block text-sm text-grey-700">{sub}</span> : null}
        </span>
        <ChevronDown className="size-5 shrink-0 text-grey-500 transition-transform group-open:rotate-180" />
      </summary>
      <div className="border-t border-border p-5">{children}</div>
    </details>
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
