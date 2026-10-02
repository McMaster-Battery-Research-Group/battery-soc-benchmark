/**
 * Purge stored full-resolution traces (.mat) from every evaluation result.
 *
 * Traces generated before the blinded-cell fix (commit "Never serve the blinded cell's
 * reference SOC") contain the true m448 SOC — the benchmark's answer key. The download is
 * now restricted to owners/admins, but the files themselves still hold the key, so this
 * deletes them outright. Re-evaluating a submission regenerates a clean traces.mat.
 *
 *   npx tsx scripts/purge-traces.ts                 # dry run: list what would be purged
 *   npx tsx scripts/purge-traces.ts --apply         # delete the files and null tracesKey
 *   node --env-file=.env.production --import tsx scripts/purge-traces.ts --apply   # production
 *
 * Idempotent: a result with no tracesKey is skipped. Safe to re-run.
 */
import "dotenv/config";
import { db } from "@/lib/db";
import { storage } from "@/lib/storage";

async function main() {
  const apply = process.argv.includes("--apply");
  const results = await db.evaluationResult.findMany({
    where: { tracesKey: { not: null } },
    select: { submissionId: true, tracesKey: true, submission: { select: { seq: true, modelName: true } } },
    orderBy: { submission: { seq: "asc" } },
  });

  if (!results.length) {
    console.log("No stored traces to purge — every result already has tracesKey = null.");
    return;
  }

  console.log(`${results.length} result(s) with stored traces${apply ? "" : " (dry run — nothing deleted)"}:`);
  let removed = 0, missing = 0;
  for (const r of results) {
    const tag = `#${r.submission?.seq ?? "?"} ${r.submission?.modelName ?? r.submissionId}`;
    if (!apply) {
      console.log(`  would purge ${tag} (${r.tracesKey})`);
      continue;
    }
    try {
      await storage.remove(r.tracesKey!);
      removed++;
    } catch (e) {
      // the object may already be gone (e.g. never migrated off the old bucket) — still null the key
      missing++;
      console.log(`  file for ${tag} not found in storage (${e instanceof Error ? e.message : String(e)}) — clearing the key anyway`);
    }
    await db.evaluationResult.update({ where: { submissionId: r.submissionId }, data: { tracesKey: null } });
    console.log(`  purged ${tag}`);
  }

  if (apply) {
    console.log(`\nDone: ${removed} file(s) deleted, ${missing} already missing, ${results.length} key(s) cleared.`);
    console.log("Re-evaluate a submission (new version) to regenerate a clean traces.mat.");
  } else {
    console.log("\nRe-run with --apply to delete the files and clear the keys.");
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
