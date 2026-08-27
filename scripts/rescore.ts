/**
 * Recompute every stored weighted error with the ACTIVE weights (defaults or
 * the latest /admin/scoring config), record a ScoreRevision per change and
 * optionally e-mail the authors a fresh PDF.
 *
 *   npx tsx scripts/rescore.ts                                   # dry run
 *   npx tsx scripts/rescore.ts --apply --note "Weights updated per lab decision 2026-09-01"
 *   npx tsx scripts/rescore.ts --apply --notify --note "…"       # also e-mail owner + accepted collaborators
 *
 * The same logic runs behind the Save button on /admin/scoring; this script is
 * for scripted/maintenance use. Runs against whatever DATABASE_URL is set
 * (`node --env-file=.env.production --import tsx scripts/rescore.ts …` for production).
 */
import "dotenv/config";
import { db } from "@/lib/db";
import { rescoreAll } from "@/lib/rescore";

function arg(name: string) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const apply = process.argv.includes("--apply");
  const notify = process.argv.includes("--notify");
  const note = arg("--note") ?? "Scoring weights updated";
  if (apply && !arg("--note")) console.warn('No --note given; the revision will say "Scoring weights updated". A specific reason is better for authors.');
  const r = await rescoreAll({ apply, notify, note, by: "scripts/rescore.ts", log: console.log });
  console.log(`${r.checked} results checked, ${r.changed} ${apply ? "updated" : "would change (re-run with --apply)"}${apply ? `, ${r.emailed} e-mails sent${!notify && r.changed ? " — authors NOT notified (add --notify)" : ""}` : ""}`);
  await db.$disconnect();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
