import type { Metadata } from "next";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { getLeaderboardRows, getOpenContest } from "@/lib/queries";
import { LeaderboardTable } from "@/components/leaderboard/leaderboard-table";
import { HowToRead } from "@/components/leaderboard/how-to-read";
import { PageHeader } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { Trophy } from "lucide-react";

export const metadata: Metadata = { title: "Leaderboard" };
export const dynamic = "force-dynamic";

export default async function LeaderboardPage() {
  const session = await auth();
  const [rows, contest] = await Promise.all([
    getLeaderboardRows({ viewerId: session?.user?.id, isAdmin: session?.user?.role === "ADMIN" }),
    getOpenContest(),
  ]);

  return (
    <>
      <PageHeader
        eyebrow="Blinded evaluation"
        title="Leaderboard"
        description="Every model below was evaluated on the same blinded Tesla 2170 drive-cycle data across −20 °C to 40 °C. Values are average RMSE in % SOC — lower is better. Hover a column header for its definition."
        actions={
          <>
            {contest ? (
              <Button asChild variant="secondary"><Link href={`/contest/${contest.slug}`}><Trophy /> Contest leaderboard</Link></Button>
            ) : null}
            <Button asChild><Link href="/submit">Submit a model</Link></Button>
          </>
        }
      />
      <div className="container-site py-8">
        <HowToRead />
        <LeaderboardTable rows={rows} viewerId={session?.user?.id} />
        <p className="mt-4 text-xs text-grey-600">
          Ranking is by weighted error regardless of the current sort. Private models are shown only to their owner and are excluded from public rankings. Read the{" "}
          <Link href="/docs" className="text-maroon underline">methodology</Link> for how each test case is constructed.
        </p>
      </div>
    </>
  );
}
