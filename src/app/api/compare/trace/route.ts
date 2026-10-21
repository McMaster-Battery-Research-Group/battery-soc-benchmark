import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { storage } from "@/lib/storage";
import { canViewSubmission } from "@/lib/queries";
import { runsOfTracesMat } from "@/lib/mat-reader";
import { displayIndices, isWorstCase, normalizeTraces, sameRun } from "@/lib/traces";
import { rateLimit, clientIp, TOO_MANY } from "@/lib/rate-limit";
import type { TimeSeriesTrace } from "@/evaluator/types";

export const dynamic = "force-dynamic";

/** Cycle family of a run name, as family() in data.py: HWCUST1 → HWCUST, US06 stays US06. */
const FAMILIES = ["UDDS", "HWFET", "LA92", "US06", "HWCUST", "HWGRADE", "REORDERED", "CC_CV_charge", "Other"];
const family = (name: string) => FAMILIES.find((f) => name.startsWith(f)) ?? name.replace(/[0-9]+$/, "");

/**
 * Compare page (tracker 2026-10-14 #23): a model's "worst case" is the cycle where IT made its
 * largest error, so the other models being compared usually have no display trace of that cycle
 * (the site stores ~240-point traces of a fixed set of cycles plus each model's own worst case).
 * Every run is in the result's full-resolution traces.mat, though: this pulls the same cycle out
 * of the other models' files, down-samples it the way the evaluator does, and returns it.
 *
 *   GET /api/compare/trace?ids=a,b,c&key=<worst-case trace key of one of them>
 *   → { traces: { [submissionId]: TimeSeriesTrace | null }, reasons: { [submissionId]: string } }
 *
 * Limits: only worst-case keys (so this never becomes a bulk export of the blinded runs), only
 * submissions the viewer may see, and never the blinded cell: its reference SOC is withheld from
 * traces.mat, so no error curve can be computed for it outside the evaluator.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const ids = (url.searchParams.get("ids") ?? "").split(",").map((s) => s.trim()).filter(Boolean).slice(0, 4);
  const key = url.searchParams.get("key") ?? "";
  if (ids.length < 2 || !isWorstCase({ key })) return NextResponse.json({ error: "ids (2–4) and a worst-case trace key are required" }, { status: 400 });
  const rl = await rateLimit(`compare-trace:${await clientIp()}`, 120, 60 * 60_000);
  if (!rl.ok) return NextResponse.json({ error: TOO_MANY(rl.retryAfterSec) }, { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } });

  const session = await auth();
  const subs = await db.submission.findMany({
    where: { id: { in: ids } },
    select: { id: true, userId: true, isPrivate: true, isHidden: true, collaborators: { select: { userId: true } }, result: { select: { timeSeries: true, tracesKey: true } } },
  });
  const visible = subs.filter((s) => canViewSubmission(s, session?.user) && s.result);
  const owner = visible.map((s) => ({ s, trace: normalizeTraces(s.result!.timeSeries as unknown as TimeSeriesTrace[]).find((t) => t.key === key) })).find((x) => x.trace);
  if (!owner?.trace) return NextResponse.json({ error: "No such trace" }, { status: 404 });
  const target = owner.trace;

  const traces: Record<string, TimeSeriesTrace | null> = {};
  const reasons: Record<string, string> = {};
  for (const s of visible) {
    const own = normalizeTraces(s.result!.timeSeries as unknown as TimeSeriesTrace[]);
    const have = own.find((t) => (t.group ?? "cycle") === "cycle" && sameRun(t, target));
    if (have) {
      traces[s.id] = have;
      continue;
    }
    if (target.blinded) {
      traces[s.id] = null;
      reasons[s.id] = "m448 is the blinded cell: its reference SOC is never released, so this model's error on the cycle cannot be computed outside the evaluator.";
      continue;
    }
    if (!s.result!.tracesKey) {
      traces[s.id] = null;
      reasons[s.id] = "This result was evaluated before full-resolution traces were stored (2026-08-30); a new version would record them.";
      continue;
    }
    try {
      const runs = runsOfTracesMat(await storage.getBytes(s.result!.tracesKey));
      const run = runs.find((r) => (r.group === "cycle" || r.group === "charge") && r.cell === target.cell && family(r.cycle) === target.cycle && r.tempC === target.temperatureC);
      if (!run || !run.actual) {
        traces[s.id] = null;
        reasons[s.id] = "This cycle is not in the model's stored traces.";
        continue;
      }
      const idx = displayIndices(run.actual, run.est);
      const actual = run.actual;
      traces[s.id] = {
        key: `full-${target.cell}-${target.cycle}-${target.temperatureC}`,
        label: `${target.cell} ${target.cycle} at ${target.temperatureC} °C`,
        cell: target.cell, cycle: target.cycle, temperatureC: target.temperatureC, group: "cycle",
        t: idx.map((i) => Math.round((i / 3600) * 1000) / 1000),
        actual: idx.map((i) => actual[i] / 100),
        estimated: idx.map((i) => run.est[i] / 100),
      };
    } catch (e) {
      traces[s.id] = null;
      reasons[s.id] = `The model's full-resolution traces could not be read (${e instanceof Error ? e.message : String(e)}).`;
    }
  }
  return NextResponse.json({ traces, reasons }, { headers: { "Cache-Control": "private, max-age=300" } });
}
