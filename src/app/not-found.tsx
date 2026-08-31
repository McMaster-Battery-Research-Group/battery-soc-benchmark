import Link from "next/link";
import { BatteryWarning } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="container-site flex min-h-[55vh] flex-col items-center justify-center py-16 text-center">
      <BatteryWarning className="size-14 text-maroon" />
      <h1 className="mt-4 font-heading text-4xl font-bold text-ink">0 % state of page</h1>
      <p className="mt-2 max-w-md text-grey-700">This page does not exist — it may have been deleted, made private, or the link has a typo.</p>
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <Button asChild><Link href="/leaderboard">Leaderboard</Link></Button>
        <Button asChild variant="outline"><Link href="/">Home</Link></Button>
        <Button asChild variant="outline"><Link href="/contact">Contact us</Link></Button>
      </div>
    </div>
  );
}
