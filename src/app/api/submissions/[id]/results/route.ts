import { getActiveWeights } from "@/lib/scoring-config";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { canViewSubmission } from "@/lib/queries";
import { TEST_CASES } from "@/lib/test-cases";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  const sub = await db.submission.findUnique({ where: { id }, include: { result: true, user: { select: { name: true, affiliation: true } } } });
  if (!sub || !canViewSubmission(sub, session?.user) || !sub.result) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const r = sub.result;
  const weights = await getActiveWeights();
  const body = {
    submission: { id: sub.id, seq: sub.seq, modelName: sub.modelName, modelType: sub.modelType, author: sub.user.name, affiliation: sub.user.affiliation, submittedAt: sub.submittedAt, completedAt: sub.completedAt },
    leaderboard: { weightedError: r.weightedError, complexity: r.complexity, complexityUncertainty: r.complexityUncertainty, maxError: r.maxError },
    testCases: TEST_CASES.map((t) => ({ test: t.test, key: t.key, label: t.label, weight: weights[t.key] ?? t.weight, rmse: r[t.key as keyof typeof r] })),
    perCycle: r.perCycle,
    timeSeries: r.timeSeries,
    evaluatorVersion: r.evaluatorVersion,
    citation: "P. J. Kollmeyer, M. Naguib, F. Khanum, A. Emadi, ITEC 2022, doi:10.1109/ITEC53557.2022.9813996",
  };
  return new NextResponse(JSON.stringify(body, null, 2), {
    headers: { "Content-Type": "application/json", "Content-Disposition": `attachment; filename="${sub.modelName.replace(/[^a-z0-9]+/gi, "_")}-results.json"` },
  });
}
