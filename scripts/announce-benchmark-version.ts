/**
 * After bumping BENCHMARK_VERSION: tell every author whose submission was
 * scored by an older benchmark that it is now shown as "legacy" and UNRANKED
 * until they re-submit (new package version or new submission).
 *
 *   npx tsx scripts/announce-benchmark-version.ts --note "What changed and why"          # dry run: lists recipients
 *   npx tsx scripts/announce-benchmark-version.ts --note "…" --send                       # sends the e-mails
 *   node --env-file=.env.production --import tsx scripts/announce-benchmark-version.ts …  # production
 *
 * Owners and accepted collaborators are each e-mailed once per submission.
 */
import "dotenv/config";
import { db } from "@/lib/db";
import { isCurrentBenchmark, BENCHMARK_VERSION } from "@/lib/benchmark-version";
import { legacyNoticeEmail } from "@/lib/mail";
import { recordRevision } from "@/lib/history";

function arg(name: string) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const send = process.argv.includes("--send");
  const note = arg("--note");
  if (!note) {
    console.error("--note \"<what changed and why>\" is required — it is quoted in the e-mail.");
    process.exit(1);
  }
  const subs = await db.submission.findMany({
    where: { status: "COMPLETED", result: { isNot: null } },
    include: { result: { select: { evaluatorVersion: true, weightedError: true } }, user: true, collaborators: { where: { acceptedAt: { not: null } }, include: { user: { select: { email: true, name: true } } } } },
  });
  const legacy = subs.filter((s) => !isCurrentBenchmark(s.result!.evaluatorVersion));
  console.log(`${legacy.length} of ${subs.length} completed submissions were scored by an older benchmark than ${BENCHMARK_VERSION}`);
  let sent = 0;
  for (const s of legacy) {
    const people = [{ email: s.user.email, name: s.user.name }, ...s.collaborators.flatMap((c) => (c.user ? [c.user] : []))];
    console.log(`#${s.seq} ${s.modelName} (${s.result!.evaluatorVersion}) → ${people.map((p) => p.email).join(", ")}`);
    if (!send) continue;
    for (const p of people) if (await legacyNoticeEmail(p.email, p.name, s.modelName, s.id, s.result!.evaluatorVersion.split("/")[0], BENCHMARK_VERSION, note)) sent++;
    await recordRevision({ submissionId: s.id, kind: "legacy", evaluatorVersion: s.result!.evaluatorVersion, weightedError: s.result!.weightedError, note: `Benchmark moved to ${BENCHMARK_VERSION}: ${note}. Score kept for reference; unranked until re-submitted.`, by: "scripts/announce-benchmark-version.ts" });
  }
  console.log(send ? `${sent} e-mails sent` : "dry run — add --send to e-mail these people");
  await db.$disconnect();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
