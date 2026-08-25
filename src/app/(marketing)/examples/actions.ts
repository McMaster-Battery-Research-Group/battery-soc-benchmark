"use server";

import { readFile } from "fs/promises";
import path from "path";
import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
import { storage } from "@/lib/storage";
import { EXAMPLE_BY_SLUG } from "@/lib/examples";
import { dryRunLimitError } from "@/lib/dry-run-quota";

export type ExampleRunStart = { ok: true; id: string } | { ok: false; error: string; needsLogin?: boolean };

/** Queue a dry run of one of the shipped example packages (no upload needed). */
export async function runExampleAction(slug: string, runtime: "matlab" | "python"): Promise<ExampleRunStart> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Sign in to run an example.", needsLogin: true };
  if (!EXAMPLE_BY_SLUG[slug]) return { ok: false, error: "Unknown example." };

  const limit = await dryRunLimitError(session.user);
  if (limit) return { ok: false, error: limit };

  const fileName = `${slug}.${runtime}.zip`;
  let bytes: Buffer;
  try {
    bytes = await readFile(path.resolve(process.cwd(), "evaluator", "examples", fileName));
  } catch {
    return { ok: false, error: "Example package is missing on the server." };
  }
  const key = await storage.put(bytes, "zip");
  const dr = await db.dryRun.create({ data: { userId: session.user.id, fileKey: key, fileName, fileSize: bytes.length } });
  return { ok: true, id: dr.id };
}
