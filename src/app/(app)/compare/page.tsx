import type { Metadata } from "next";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { getLeaderboardRows } from "@/lib/queries";
import { PageHeader } from "@/components/ui/misc";
import { CompareClient } from "./compare-client";
import type { TimeSeriesTrace } from "@/evaluator/types";

export const metadata: Metadata = { title: "Compare models" };
export const dynamic = "force-dynamic";

export default async function ComparePage({ searchParams }: { searchParams: Promise<{ ids?: string }> }) {
  const sp = await searchParams;
  const session = await auth();
  const rows = await getLeaderboardRows({ viewerId: session?.user?.id, isAdmin: session?.user?.role === "ADMIN" });
  const ids = (sp.ids ?? "").split(",").filter((id) => rows.some((r) => r.id === id)).slice(0, 4);
  const traces = ids.length
    ? await db.evaluationResult.findMany({ where: { submissionId: { in: ids } }, select: { submissionId: true, timeSeries: true } })
    : [];
  const tracesById = Object.fromEntries(traces.map((t) => [t.submissionId, t.timeSeries as unknown as TimeSeriesTrace[]]));

  return (
    <>
      <PageHeader eyebrow="Side by side" title="Compare models" description="Pick two to four evaluated models to overlay their test-case errors, temperature sensitivity and time-domain SOC traces on the same blinded cycles." />
      <div className="container-site py-8">
        <CompareClient rows={rows} initialIds={ids} tracesById={tracesById} />
      </div>
    </>
  );
}
