import { Prisma } from "@prisma/client";

import { db } from "@/lib/db";

type Usage = {
  peakMemMb?: number;
  meanMemMb?: number;
  limitMemMb?: number;
  peakCpuPct?: number;
  meanCpuPct?: number;
  limitCpuPct?: number;
  samples?: number;
};

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const pct = (used: number, limit: number) => (limit > 0 ? Math.round((used / limit) * 100) : 0);

/**
 * What evaluations actually consumed, measured per run. The point is to size the evaluation host
 * — and to justify quota requests — from observed peaks rather than from the configured limits.
 */
export async function ResourceUsagePanel() {
  const rows = await db.evaluationResult.findMany({
    where: { NOT: { resourceUsage: { equals: Prisma.DbNull } } },
    include: { submission: { select: { seq: true, modelName: true, runtime: true } } },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  const measured = rows
    .map((r) => ({ u: (r.resourceUsage ?? {}) as Usage, s: r.submission }))
    .filter((r) => num(r.u?.peakMemMb) !== null);

  if (!measured.length) {
    return (
      <>
        <h2 className="mt-8 font-heading text-lg font-semibold">Measured resource use</h2>
        <p className="mt-2 max-w-prose text-sm text-grey-600">
          Nothing measured yet. Every Docker evaluation from now on records the memory and CPU it actually used, so the
          container limits and the size of this machine can be set from real numbers.
        </p>
      </>
    );
  }

  const peakMem = Math.max(...measured.map((r) => num(r.u.peakMemMb) ?? 0));
  const limitMem = num(measured[0].u.limitMemMb) ?? 0;
  const peakCpu = Math.max(...measured.map((r) => num(r.u.peakCpuPct) ?? 0));
  const limitCpu = num(measured[0].u.limitCpuPct) ?? 0;
  const worst = measured.reduce((a, b) => ((num(b.u.peakMemMb) ?? 0) > (num(a.u.peakMemMb) ?? 0) ? b : a));

  return (
    <>
      <h2 className="mt-8 font-heading text-lg font-semibold">Measured resource use</h2>
      <p className="mt-1 max-w-prose text-sm text-grey-600">
        Sampled inside the sandbox while each evaluation ran. Peaks across the last {measured.length} measured run
        {measured.length === 1 ? "" : "s"}.
      </p>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div className="card p-4">
          <p className="font-heading text-xs font-semibold uppercase tracking-wide text-grey-600">Peak memory</p>
          <p className="mt-1 font-heading text-2xl font-bold tabular">
            {Math.round(peakMem)} <span className="text-base font-medium text-grey-600">of {limitMem} MB</span>
          </p>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-grey-200">
            <div className="h-full bg-maroon" style={{ width: `${Math.min(100, pct(peakMem, limitMem))}%` }} />
          </div>
          <p className="mt-1.5 text-xs text-grey-600">
            {pct(peakMem, limitMem)} % of the limit · highest was #{worst.s.seq} {worst.s.modelName}
          </p>
        </div>

        <div className="card p-4">
          <p className="font-heading text-xs font-semibold uppercase tracking-wide text-grey-600">Peak CPU</p>
          <p className="mt-1 font-heading text-2xl font-bold tabular">
            {Math.round(peakCpu)} <span className="text-base font-medium text-grey-600">of {limitCpu} %</span>
          </p>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-grey-200">
            <div className="h-full bg-gold" style={{ width: `${Math.min(100, pct(peakCpu, limitCpu))}%` }} />
          </div>
          <p className="mt-1.5 text-xs text-grey-600">100 % is one core fully busy</p>
        </div>
      </div>

      <div className="card mt-3 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left font-heading text-xs uppercase tracking-wide text-grey-600">
              <th className="px-3 py-2">Submission</th>
              <th className="px-3 py-2">Runtime</th>
              <th className="px-3 py-2 text-right">Peak memory</th>
              <th className="px-3 py-2 text-right">Mean</th>
              <th className="px-3 py-2 text-right">Peak CPU</th>
              <th className="px-3 py-2 text-right">Samples</th>
            </tr>
          </thead>
          <tbody>
            {measured.slice(0, 15).map((r, i) => {
              const pm = num(r.u.peakMemMb) ?? 0;
              return (
                <tr key={i} className="border-b border-border last:border-b-0">
                  <td className="px-3 py-2">
                    <span className="text-grey-600">#{r.s.seq}</span> {r.s.modelName}
                  </td>
                  <td className="px-3 py-2 text-grey-600">{r.s.runtime ?? "—"}</td>
                  <td className="px-3 py-2 text-right tabular">
                    {Math.round(pm)} MB
                    <span className="ml-1.5 text-xs text-grey-600">{pct(pm, limitMem)} %</span>
                  </td>
                  <td className="px-3 py-2 text-right tabular text-grey-600">{Math.round(num(r.u.meanMemMb) ?? 0)} MB</td>
                  <td className="px-3 py-2 text-right tabular text-grey-600">{Math.round(num(r.u.peakCpuPct) ?? 0)} %</td>
                  <td className="px-3 py-2 text-right tabular text-grey-600">{num(r.u.samples) ?? 0}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="mt-2 max-w-prose text-xs text-grey-600">
        A peak well below the limit means containers could be smaller, letting more run at once on the same machine. A
        peak near the limit means the limit is binding and submissions may be failing for lack of memory.
      </p>
    </>
  );
}
