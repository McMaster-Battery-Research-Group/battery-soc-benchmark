import { contestPhase } from "@/lib/contest";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Lock, ArrowLeft, Trophy, Download, FileText, Settings2, ChevronDown, Table2, Crosshair, BarChart3, ListOrdered, History, Info } from "lucide-react";
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
import { CopyLink } from "@/components/copy-link";
import { Scorecard } from "@/components/scorecard";
import { ResultInsights } from "@/components/result-insights";
import { ResultSummary } from "@/components/result-summary";
import { ResultTabs } from "@/components/result-tabs";
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
import { publicAuthors, ownerDisplayOf, guestAvatar } from "@/lib/authors";
import { EditAuthorship } from "@/app/(admin)/admin/submissions/authorship";
import { ResourceChart, type ResourceSeries } from "./resource-chart";
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
  // the public author list (src/lib/authors.ts); the owner account may not be on it
  const authors = publicAuthors(sub);
  const firstAuthor = authors[0];
  const legacy = r ? !isCurrentBenchmark(r.evaluatorVersion) : false;
  const traces = (r?.timeSeries ?? []) as unknown as TimeSeriesTrace[];
  const perCycle = (r?.perCycle ?? []) as unknown as PerCycleRow[];
  const worstRow = perCycle.length ? perCycle.reduce((m, x) => (x.maxErr > m.maxErr ? x : m)) : null;

  const aboutSection = (
      <section className="card p-5">
        <h2 className="font-heading font-semibold text-ink">About this submission</h2>
        <p className="mt-2 max-w-3xl text-[15px] leading-relaxed text-grey-800">{sub.description}</p>
        <dl className="mt-4 grid gap-x-8 gap-y-2 text-sm sm:grid-cols-2">
          {sub.fileName && sub.fileSize !== null ? (
            <Row k="Package" v={`${sub.fileName} (${fmtBytes(sub.fileSize)}), deleted after evaluation`} />
          ) : (
            <Row k="Package" v="None; this is a carried-over record, not a run of this evaluator" />
          )}
          <Row k="Visibility" v={sub.isPrivate ? "Private (owner only)" : "Public"} />
          {r ? <Row k="Evaluator" v={`${r.evaluatorVersion}${legacy ? ` (legacy; current benchmark is ${BENCHMARK_VERSION}. Kept for reference, unranked until a new version is submitted.)` : ""}`} /> : null}
          {sub.completedAt ? <Row k="Completed" v={fmtDateTime(sub.completedAt)} /> : null}
          <Row k="Submission ID" v={sub.id} />
        </dl>
      </section>
  );

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
            <span>#{sub.seq}{sub.version > 1 ? ` · v${sub.version}` : ""} · {MODEL_TYPE_LABELS[sub.modelType]} · {fmtDateTime(sub.submittedAt)}</span>
            <CopyLink path={`/submissions/${sub.id}`} />
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <div className="flex -space-x-2">
              {authors.map((u, i) =>
                u.id ? (
                  <Link key={u.id} href={`/users/${u.id}`} title={u.name} className="rounded-full ring-2 ring-white">
                    <Avatar userId={u.id} name={u.name} hasAvatar={u.avatarVersion !== null} version={u.avatarVersion} size={28} />
                  </Link>
                ) : (
                  <span key={`x${i}`} title={u.name} className="rounded-full ring-2 ring-white">
                    <Avatar userId="" name={u.name} hasAvatar={false} src={u.avatarSrc} size={28} />
                  </span>
                ),
              )}
            </div>
            <span className="text-sm text-grey-700">
              {authors.map((u, i) => (
                <React.Fragment key={u.id ?? `x${i}`}>{i ? ", " : ""}{u.id ? <Link href={`/users/${u.id}`} className="text-ink hover:text-maroon hover:underline">{u.name}</Link> : <span className="text-ink">{u.name}</span>}</React.Fragment>
              ))}
              {authors.length === 1 && firstAuthor.affiliation ? ` · ${firstAuthor.affiliation}` : ""}
            </span>
            {isAdmin ? (
              <EditAuthorship
                id={sub.id}
                seq={sub.seq}
                modelName={sub.modelName}
                owner={{ id: sub.user.id, name: sub.user.name, email: sub.user.email, affiliation: sub.user.affiliation, avatarVersion: sub.user.avatarUpdatedAt?.getTime() ?? null }}
                credit={{ name: sub.creditName, affiliation: sub.creditAffiliation, avatarSrc: guestAvatar(sub.id, "credit", sub.creditAvatarAt, sub.creditName ?? "") }}
                ownerDisplay={sub.ownerDisplay}
                coAuthors={sub.collaborators.map((c) => ({ id: c.user?.id ?? null, rowId: c.id, name: c.user?.name ?? c.name ?? "Unnamed co-author", email: c.user?.email ?? "", affiliation: c.user?.affiliation ?? c.affiliation ?? undefined, avatarVersion: c.user?.avatarUpdatedAt?.getTime() ?? null, avatarSrc: c.user ? null : guestAvatar(sub.id, c.id, c.avatarAt, c.name ?? "") }))}
              />
            ) : null}
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {r ? (
            <>
              <Button asChild variant="secondary" size="sm"><a href={`/api/submissions/${sub.id}/report.pdf`} target="_blank" rel="noreferrer"><FileText /> PDF report</a></Button>
              <Button asChild variant="outline" size="sm"><a href={`/api/submissions/${sub.id}/results`} download><Download /> JSON</a></Button>
            </>
          ) : null}
          {canManage ? (
          <details className="group relative shrink-0">
            <summary className="inline-flex cursor-pointer list-none items-center gap-2 rounded-brand border border-border bg-white px-3 py-2 font-heading text-sm font-medium text-grey-900 hover:bg-grey-100 [&::-webkit-details-marker]:hidden">
              <Settings2 className="size-4" /> Manage <ChevronDown className="size-4 text-grey-500 transition-transform group-open:rotate-180" />
            </summary>
            <div className="absolute right-0 z-20 mt-2 w-max min-w-64 rounded-brand border border-border bg-white p-3 shadow-lg">
              <div className="flex flex-col items-stretch gap-2 [&_button]:w-full [&_button]:justify-start">
                {isAdmin ? <EditDetailsDialog id={sub.id} modelName={sub.modelName} description={sub.description} modelType={sub.modelType} locked={!!sub.contest && contestPhase(sub.contest) !== "open"} /> : null}
                {sub.status === "COMPLETED" || sub.status === "FAILED" ? (
                  <NewVersionDialog id={sub.id} version={sub.version} directUpload={(process.env.STORAGE ?? "local") === "supabase"} maxMb={Number(process.env.MAX_UPLOAD_MB ?? 50)} disabledReason={sub.contest && contestPhase(sub.contest) !== "open" ? "Contest closed; its entries are frozen. Submit a new (non-contest) submission instead." : undefined} />
                ) : null}
                <div className="my-1 h-px bg-border" />
                <OwnerActions id={sub.id} status={sub.status} isPrivate={sub.isPrivate} isHidden={sub.isHidden} isAdmin={isAdmin} isOwner={isOwner} inContest={!!sub.contestId} cancelRequested={!!sub.job?.cancelRequestedAt} />
              </div>
            </div>
          </details>
        ) : null}
        </div>
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
          <ResultSummary values={values} weightedError={r.weightedError} rank={rank} legacy={legacy} />
          <ResultInsights values={values} weights={weights} />
          <ResultTabs
            tabs={[
              {
                id: "scorecard", label: "Scorecard", icon: <Table2 />,
                content: <Scorecard values={values} weights={weights} weightedError={r.weightedError} complexity={r.complexity} complexityUncertainty={r.complexityUncertainty} maxError={r.maxError} worstCase={worstRow ? `${worstRow.cell} ${worstRow.cycle} at ${worstRow.temperatureC} °C` : undefined} />,
              },
              {
                id: "key-cases", label: "Key cases", icon: <Crosshair />,
                content: (
                  <>
                    <p className="mb-4 text-sm text-grey-700">The runs that separate estimators: cold and hot cycles, the blinded cell, a wrong initial SOC, a biased current sensor. Each plot says why it is there.</p>
                    <KeyCases traces={traces} modelName={sub.modelName} robustness={r.robustness as { initialSocRmse: number[]; currentOffsetRmse: number[] } | null} perCycle={perCycle} />
                  </>
                ),
              },
              {
                id: "charts", label: "Charts", icon: <BarChart3 />,
                content: (
                  <>
                    <p className="mb-4 text-sm text-grey-700">The scorecard as bar charts: tests 1 to 8, and RMSE against temperature (test 9).</p>
                    <div className="grid gap-6 xl:grid-cols-5">
                      <div className="xl:col-span-3"><TestCaseBars series={[{ name: sub.modelName, values }]} /></div>
                      <div className="xl:col-span-2"><TemperatureBars series={[{ name: sub.modelName, values }]} /></div>
                    </div>
                  </>
                ),
              },
              {
                id: "all-cycles", label: "All 144 cycles", icon: <ListOrdered />,
                content: (
                  <>
                    <p className="mb-4 text-sm text-grey-700">Every blinded drive cycle: per-cycle errors, and any of the plotted cycles in the time domain.</p>
                    <PerCycleTable rows={perCycle} modelName={sub.modelName} />
                    <div className="mt-6">
                      <SocTracePicker tracesByModel={[traces.filter((t) => (t.group ?? "cycle") === "cycle")]} names={[sub.modelName]} />
                      <p className="mt-3 text-xs text-grey-600">One hour of padded data precedes every cycle in the evaluator and is excluded from the error metrics. Charts are down-sampled for display (peaks preserved); the full 1 Hz data is in the traces download.</p>
                    </div>
                  </>
                ),
              },
              ...(history.length
                ? [{
                    id: "score-history", label: "History", icon: <History />, count: String(history.length),
                    content: (
                      <>
                        <p className="mb-2 text-sm text-grey-700">Every evaluation attempt and every change to how this submission is scored; the current score is the last row.</p>
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
                                  {h.weightedError === null ? <span className="text-danger">failed</span> : <><span className="font-heading font-semibold text-ink">{fmtPct(h.weightedError)} %</span>{delta !== null && Math.abs(delta) > 0.0005 ? <span className={`ml-2 text-xs ${delta < 0 ? "text-forest" : "text-danger"}`}>{delta < 0 ? "" : "+"}{fmtPct(delta)}</span> : null}</>}
                                </span>
                              </li>
                            );
                          })}
                        </ol>
                      </>
                    ),
                  }]
                : []),
              {
                id: "details", label: "Details", icon: <Info />,
                content: (
                  <div className="space-y-5">
                    {aboutSection}
                    <section className="card flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <h2 className="font-heading font-semibold text-ink">Downloads</h2>
                        <p className="text-sm text-grey-700">
                          PDF report (summary, every test case with the arithmetic, key plots, per-cycle table) · results as JSON ·{" "}
                          {r.tracesKey && canSee ? "full 1 Hz traces of all 195 runs as a MATLAB v7 file (0.01 % SOC steps; readable with scipy.io.loadmat, see the readme variable inside; the blinded cell's reference SOC is withheld)" : "full-resolution traces are available to the submission's authors"}.
                        </p>
                      </div>
                      <div className="flex shrink-0 flex-wrap gap-2">
                        <Button asChild variant="secondary" size="sm"><a href={`/api/submissions/${sub.id}/report.pdf`} target="_blank" rel="noreferrer"><FileText /> PDF report</a></Button>
                        <Button asChild variant="outline" size="sm"><a href={`/api/submissions/${sub.id}/results`} download><Download /> JSON</a></Button>
                        {r.tracesKey && canSee ? <Button asChild variant="outline" size="sm"><a href={`/api/submissions/${sub.id}/traces`} download><Download /> Traces (.mat)</a></Button> : null}
                      </div>
                    </section>
                    <Fold title={`How a ${MODEL_TYPE_LABELS[sub.modelType].replace(/^([A-Z])(?=[a-z])/, (c) => c.toLowerCase())} works`} sub="The canonical structure for this model family; the description above gives the specific architecture.">
                      <ModelSchematic spec={specForModelType(sub.modelType)} title={`${MODEL_TYPE_LABELS[sub.modelType]}: standardized view`} />
                    </Fold>
                  </div>
                ),
              },
            ]}
          />
        </div>
      ) : null}

      {/* 5. housekeeping */}
      {!(r && values) ? <div className="mt-6">{aboutSection}</div> : null}
      {isAdmin && sub.result?.resourceUsage ? <ResourceChart usage={sub.result.resourceUsage as unknown as ResourceSeries} /> : null}

      <Collaborators submissionId={sub.id} owner={toPerson(sub.user)} /* the owner's panel drives the invitation flow, so it lists account-linked co-authors only; administrator credits are managed in the admin panel */
        list={sub.collaborators.flatMap((c) => (c.user ? [{ ...toPerson(c.user), notified: !!c.notifiedAt, accepted: !!c.acceptedAt }] : []))} canEdit={canManage} viewerId={session?.user?.id}
        ownerDisplay={ownerDisplayOf(sub)} hasCredit={!!sub.creditName} othersShown={authors.filter((a) => a.id !== sub.user.id).length} />
    </div>
  );
}

/** Collapsed section (native <details>, no JS): title + one-line summary; opens in place. */
function Fold({ id, title, sub, children }: { id?: string; title: string; sub?: string; children: React.ReactNode }) {
  return (
    <details id={id} className="group card scroll-mt-24">
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
