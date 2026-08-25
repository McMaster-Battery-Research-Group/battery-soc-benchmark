import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const dr = await db.dryRun.findUnique({ where: { id } });
  if (!dr || (dr.userId !== session.user.id && session.user.role !== "ADMIN")) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ status: dr.status, result: dr.result, failureMessage: dr.failureMessage, log: dr.log, fileName: dr.fileName });
}
