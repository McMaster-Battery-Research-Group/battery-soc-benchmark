import { readFile } from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";
import { EXAMPLE_BY_SLUG } from "@/lib/examples";

/** Serves the shipped example packages (evaluator/examples/<slug>.<runtime>.zip). */
export async function GET(_req: Request, { params }: { params: Promise<{ file: string }> }) {
  const { file } = await params;
  const m = /^([a-z0-9-]+)\.(matlab|python)\.zip$/.exec(file);
  if (!m || !EXAMPLE_BY_SLUG[m[1]]) return NextResponse.json({ error: "Not found" }, { status: 404 });
  try {
    const bytes = await readFile(path.resolve(process.cwd(), "evaluator", "examples", file));
    return new NextResponse(new Uint8Array(bytes), { headers: { "Content-Type": "application/zip", "Content-Disposition": `attachment; filename="${file}"`, "Cache-Control": "public, max-age=3600" } });
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}
