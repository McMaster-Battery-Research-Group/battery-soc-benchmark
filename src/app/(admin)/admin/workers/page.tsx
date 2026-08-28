import { progressFromLog, fmtDuration } from "@/lib/progress";
import Link from "next/link";
import { Activity, PauseCircle, XCircle, Cpu, MemoryStick, HardDrive, GitCommit, Boxes } from "lucide-react";
import { db } from "@/lib/db";
import { ONLINE_WINDOW_MS, ago } from "@/lib/worker-status";
import { fmtDateTime } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Stat, Alert } from "@/components/ui/misc";
import { WorkerControls, JobControls, AutoRefresh, LogView } from "./controls";

export const dynamic = "force-dynamic";

export default async function WorkersPage() {
  const since = new Date(Date.now() - ONLINE_WINDOW_MS);
  const [workers, active, failed] = await Promise.all([
    db.workerHeartbeat.findMany({ orderBy: [{ lastSeenAt: "desc" }] }),
    db.submission.findMany({
      where: { status: { in: ["QUEUED", "RUNNING"] } },
      orderBy: [{ status: "desc" }, { submittedAt: "asc" }],
      include: { user: { select: { name: true } }, job: { select: { attempts: true, lockedAt: true, lockedBy: true, createdAt: true, log: true } } },
    }),
    db.submission.findMany({ where: { status: "FAILED" }, orderBy: { completedAt: "desc" }, take: 8, include: { user: { select: { name: true } }, job: { select: { attempts: true } } } }),
  ]);
  const online = workers.filter((w) => w.lastSeenAt >= since);
  const capacity = online.filter((w) => !w.paused).reduce((n, w) => n + w.concurrency, 0);
  const inFlight = online.reduce((n, w) => n + w.busyWith.length, 0);
  const queued = active.filter((s) => s.status === "QUEUED").length;
  // runtimes with queued work but no online, un-paused worker that declares them
  const canRun = (w: { runtimes: string }, rt: string) => w.runtimes.split(",").map((x) => x.trim()).includes(rt);
  const stranded = ["python", "matlab"]
    .map((rt) => ({ rt, n: active.filter((s) => s.status === "QUEUED" && (s.runtime ?? rt) === rt).length, workers: online.filter((w) => !w.paused && canRun(w, rt)).length }))
    .filter((x) => x.n > 0 && x.workers === 0);

  return (
    <div>
      <AutoRefresh seconds={15} />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-bold">Evaluation workers</h1>
          <p className="mt-1 text-sm text-grey-700">Every machine running <code className="rounded bg-grey-100 px-1">npm run worker</code> reports here every 15 s. Add computers to add throughput — jobs are claimed atomically, so nothing else needs configuring. This page refreshes itself.</p>
        </div>
      </div>

      {stranded.map((x) => (
        <Alert key={x.rt} variant="warning" className="mt-5" title={`${x.n} queued ${x.rt === "matlab" ? "MATLAB" : "Python"} submission${x.n > 1 ? "s" : ""} cannot start — no online worker runs ${x.rt === "matlab" ? "MATLAB" : "Python"} packages`}>
          Workers only claim the runtimes they declare (<code className="rounded bg-grey-100 px-1">WORKER_RUNTIMES</code>). Start a worker that can run {x.rt === "matlab" ? "MATLAB (today: the lab laptop with MATLAB installed)" : "Python (the Arbutus VM or the laptop)"}; the queued submissions start automatically when it reports in. Authors see &ldquo;no evaluator for {x.rt === "matlab" ? "MATLAB" : "Python"} packages is online&rdquo; on their submission page meanwhile.
        </Alert>
      ))}
      <div className="mt-5 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Machines online" value={online.length} sub={workers.length > online.length ? `${workers.length - online.length} stale` : "all reporting"} />
        <Stat label="Parallel slots" value={capacity} sub={`${inFlight} in use`} />
        <Stat label="Queued" value={queued} sub={capacity ? `≈ ${Math.ceil(queued / Math.max(1, capacity)) * 45} min at 45 min/run` : "no capacity online"} />
        <Stat label="Completed / failed" value={`${workers.reduce((n, w) => n + w.completed, 0)} / ${workers.reduce((n, w) => n + w.failed, 0)}`} sub="since each worker started" />
      </div>

      {/* ---------- machines */}
      <h2 className="mt-8 font-heading text-lg font-semibold">Machines</h2>
      {workers.length === 0 ? (
        <p className="mt-2 text-sm text-grey-700">No worker has ever reported. Start one with <code className="rounded bg-grey-100 px-1">npm run worker</code> on a machine that has the production <code className="rounded bg-grey-100 px-1">.env</code>.</p>
      ) : (
        <div className="mt-3 space-y-4">
          {workers.map((w) => {
            const isOnline = w.lastSeenAt >= since;
            const memPct = w.memTotalMb ? Math.round(((w.memTotalMb - w.memFreeMb) / w.memTotalMb) * 100) : null;
            return (
              <section key={w.id} className={`card p-5 ${isOnline ? "" : "opacity-75"}`}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-heading text-lg font-semibold text-ink">{w.hostname}</h3>
                      {!isOnline ? <Badge variant="neutral"><XCircle className="size-3" /> Offline · last seen {ago(w.lastSeenAt)}</Badge> : w.paused ? <Badge variant="gold"><PauseCircle className="size-3" /> Paused</Badge> : w.busyWith.length ? <Badge variant="maroon"><Activity className="size-3" /> Evaluating {w.busyWith.length}/{w.concurrency}</Badge> : <Badge variant="success"><Activity className="size-3" /> Idle</Badge>}
                      {w.command ? <Badge variant="neutral">command pending: {w.command}</Badge> : null}
                    </div>
                    <p className="mt-1 text-xs text-grey-600">{w.id} · evaluator <strong>{w.evaluator}</strong> · concurrency {w.concurrency} · started {fmtDateTime(w.startedAt)} · {w.completed} completed · {w.failed} failed</p>
                  </div>
                  <WorkerControls id={w.id} paused={w.paused} online={isOnline} />
                </div>

                <dl className="mt-4 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
                  <Diag icon={Cpu} label="CPU" value={`${w.cpus} cores · load ${w.loadAvg}`} />
                  <Diag icon={MemoryStick} label="Memory" value={w.memTotalMb ? `${Math.round((w.memTotalMb - w.memFreeMb) / 1024)} / ${Math.round(w.memTotalMb / 1024)} GB used${memPct !== null ? ` (${memPct} %)` : ""}` : "—"} warn={memPct !== null && memPct > 90} />
                  <Diag icon={HardDrive} label="Disk free" value={w.diskFreeMb !== null ? `${Math.round(w.diskFreeMb / 1024)} GB` : "—"} warn={w.diskFreeMb !== null && w.diskFreeMb < 2048} />
                  <Diag icon={Boxes} label="Platform" value={`${w.platform} · Node ${w.nodeVersion}`} />
                  <Diag icon={GitCommit} label="Code" value={w.gitSha || "unknown"} />
                  <Diag label="Python" value={w.pythonInfo || "—"} warn={/not found/.test(w.pythonInfo)} />
                  <Diag label="MATLAB" value={w.matlabInfo || "—"} warn={/not found/.test(w.matlabInfo)} />
                  <Diag label="Blinded data" value={w.blindData ? "present" : w.evaluator === "real" ? "MISSING — real evaluations will fail" : "not needed (mock)"} warn={!w.blindData && w.evaluator === "real"} />
                  {w.busyWith.length ? (
                    <Diag
                      label="Working on"
                      value={
                        <>
                          {w.busyWith.map((id) => {
                            const s = active.find((x) => x.id === id);
                            const p = s?.job?.log ? progressFromLog(s.job.log) : null;
                            return (
                              <span key={id} className="mr-3 inline-block">
                                <Link href={`/submissions/${id}`} className="text-maroon underline">{s ? `#${s.seq} ${s.modelName}` : `${id.slice(0, 10)}…`}</Link>
                                {p && p.pct !== null ? <span className="ml-1.5 text-grey-700">{p.pct.toFixed(0)} %{p.etaSec !== null ? ` · ${fmtDuration(p.etaSec)} left` : ""}</span> : null}
                              </span>
                            );
                          })}
                        </>
                      }
                    />
                  ) : null}
                  {w.lastError ? <Diag label="Last error" value={w.lastError} warn /> : null}
                </dl>

                <LogView title={`Console — last ${w.log ? w.log.split("\n").length : 0} lines`} log={w.log} />
              </section>
            );
          })}
        </div>
      )}

      {/* ---------- queue */}
      <h2 className="mt-8 font-heading text-lg font-semibold">Queue</h2>
      {active.length === 0 ? (
        <p className="mt-2 text-sm text-grey-700">Nothing queued or running.</p>
      ) : (
        <div className="card mt-3 overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-grey-100 text-left font-heading text-xs uppercase tracking-wide text-grey-800">
              <tr><th className="px-3 py-2">#</th><th className="px-3 py-2">Model</th><th className="px-3 py-2">Status</th><th className="px-3 py-2">Worker</th><th className="px-3 py-2">Lock age</th><th className="px-3 py-2">Attempts</th><th className="px-3 py-2">Submitted</th><th className="px-3 py-2"></th></tr>
            </thead>
            <tbody>
              {active.map((s, i) => {
                const lockAge = s.job?.lockedAt ? ago(s.job.lockedAt) : "—";
                const stale = s.status === "RUNNING" && s.job?.lockedAt && Date.now() - s.job.lockedAt.getTime() > 5 * 60_000;
                return (
                  <tr key={s.id} className="border-t border-border">
                    <td className="px-3 py-2 text-grey-600">{i + 1}</td>
                    <td className="px-3 py-2"><Link href={`/submissions/${s.id}`} className="font-heading font-medium text-ink hover:text-maroon hover:underline">{s.modelName}</Link><div className="text-xs text-grey-600">#{s.seq} · {s.user.name}</div></td>
                    <td className="px-3 py-2"><Badge variant={s.status === "RUNNING" ? "maroon" : "neutral"}>{s.status}</Badge></td>
                    <td className="px-3 py-2 text-grey-700">{s.job?.lockedBy ?? "—"}</td>
                    <td className={`px-3 py-2 ${stale ? "text-danger" : "text-grey-700"}`}>{lockAge}{stale ? " · no heartbeat for 5 min" : ""}</td>
                    <td className="px-3 py-2 text-grey-700">{s.job?.attempts ?? 0}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-grey-700">{fmtDateTime(s.submittedAt)}</td>
                    <td className="px-3 py-2 text-right"><JobControls submissionId={s.id} status={s.status} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ---------- recent failures */}
      <h2 className="mt-8 font-heading text-lg font-semibold">Recent failures</h2>
      {failed.length === 0 ? (
        <p className="mt-2 text-sm text-grey-700">None.</p>
      ) : (
        <ul className="mt-3 divide-y divide-border rounded-brand border border-border">
          {failed.map((s) => (
            <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
              <span className="min-w-0"><Link href={`/submissions/${s.id}`} className="font-heading font-medium text-ink hover:text-maroon hover:underline">{s.modelName}</Link><span className="text-grey-600"> · #{s.seq} · {s.user.name} · {s.completedAt ? fmtDateTime(s.completedAt) : ""} · {s.job?.attempts ?? 0} attempts</span><span className="block truncate text-xs text-grey-600">{s.failureMessage}</span></span>
              <JobControls submissionId={s.id} status="FAILED" />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Diag({ icon: Icon, label, value, warn }: { icon?: React.ComponentType<{ className?: string }>; label: string; value: React.ReactNode; warn?: boolean }) {
  return (
    <div className="flex items-start gap-2">
      {Icon ? <Icon className="mt-0.5 size-4 shrink-0 text-grey-500" /> : <span className="size-4 shrink-0" />}
      <div className="min-w-0">
        <dt className="font-heading text-xs font-semibold uppercase tracking-wide text-grey-600">{label}</dt>
        <dd className={`break-words ${warn ? "text-danger" : "text-grey-900"}`}>{value}</dd>
      </div>
    </div>
  );
}
