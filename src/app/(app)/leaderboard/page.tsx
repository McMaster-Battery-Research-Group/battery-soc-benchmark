import type { Metadata } from "next";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { getLeaderboardRows } from "@/lib/queries";
import { isCurrentBenchmark } from "@/lib/benchmark-version";
import { LeaderboardTable } from "@/components/leaderboard/leaderboard-table";
import { HowToRead } from "@/components/leaderboard/how-to-read";
import { PageHeader } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { MessageSquare, GitCompareArrows } from "lucide-react";

export const metadata: Metadata = { title: "Leaderboard" };
export const dynamic = "force-dynamic";

export default async function LeaderboardPage() {
  const session = await auth();
  const rows = await getLeaderboardRows({ viewerId: session?.user?.id, isAdmin: session?.user?.role === "ADMIN" });

  return (
    <>
      <PageHeader
        eyebrow="Blinded evaluation"
        title="Leaderboard"
        description="Every model was scored on the same hidden Tesla 2170 drive-cycle data from −20 °C to 40 °C. Numbers are average RMSE in % SOC — lower is better."
        actions={
          <>
            <Button asChild variant="outline"><Link href="/compare"><GitCompareArrows /> Compare models</Link></Button>
            <Button asChild variant="outline"><Link href="/contact?from=/leaderboard"><MessageSquare /> Contact administrator</Link></Button>
            <Button asChild><Link href="/submit">Submit a model</Link></Button>
          </>
        }
      />
      <div className="container-site py-10">
        <HowToRead legacyCount={rows.filter((r) => !isCurrentBenchmark(r.evaluatorVersion)).length} hasPrivate={!!session?.user?.id && rows.some((r) => r.isPrivate && r.userId === session.user!.id)} />
        <LeaderboardTable rows={rows} viewerId={session?.user?.id} />
        <p className="mt-4 text-xs text-grey-600">
          Ranking is by weighted error regardless of the current sort. Private models are shown only to their owner and are excluded from public rankings. Read the{" "}
          <Link href="/docs" className="text-maroon underline">methodology</Link> for how each test case is constructed.
        </p>
      </div>
    </>
  );
}
