"use client";

import Link from "next/link";
import { RotateCcw, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Route-level crash screen (replaces Next's grey "Application error" text). The error is logged for us; the visitor gets a way out. */
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="container-site flex min-h-[55vh] flex-col items-center justify-center py-16 text-center">
      <TriangleAlert className="size-14 text-maroon" />
      <h1 className="mt-4 font-heading text-4xl font-bold text-ink">Something short-circuited</h1>
      <p className="mt-2 max-w-md text-grey-700">An unexpected error occurred while rendering this page. It has been logged{error.digest ? ` (ref ${error.digest})` : ""} — trying again usually works.</p>
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <Button onClick={reset}><RotateCcw /> Try again</Button>
        <Button asChild variant="outline"><Link href="/">Home</Link></Button>
        <Button asChild variant="outline"><Link href="/contact?category=bug">Report it</Link></Button>
      </div>
    </div>
  );
}
