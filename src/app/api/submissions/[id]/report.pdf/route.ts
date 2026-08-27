import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { canViewSubmission } from "@/lib/queries";
import { buildSubmissionReport, type ReportInput } from "@/lib/report";
import { getHistory } from "@/lib/history";
import { getActiveWeights } from "@/lib/scoring-config";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  const sub = await db.submission.findUnique({ where: { id }, include: { result: true, user: { select: { name: true, affiliation: true } }, collaborators: { where: { acceptedAt: { not: null } }, include: { user: { select: { name: true, affiliation: true } } }, orderBy: { addedAt: "asc" } } } });
  if (!sub || !canViewSubmission(sub, session?.user) || !sub.result) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const pdf = await buildSubmissionReport({
    submission: sub,
    user: sub.user,
    collaborators: sub.collaborators.map((c) => c.user),
    history: await getHistory(id),
    weights: await getActiveWeights(),
    result: sub.result as unknown as ReportInput["result"],
    siteUrl: process.env.NEXT_PUBLIC_SITE_URL ?? "https://batterysocbenchmark.ca",
  });
  const name = `${sub.modelName.replace(/[^a-z0-9]+/gi, "_")}-soc-benchmark-report.pdf`;
  return new NextResponse(new Uint8Array(pdf), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${name}"`, "Cache-Control": "private, max-age=300" } });
}
