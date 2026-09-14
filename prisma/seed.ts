/**
 * Seeds an admin, a handful of fictional researchers, and one open contest.
 * No submissions or results are fabricated: every score on the site comes from
 * a real evaluation.
 *   npm run seed
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const db = new PrismaClient();

const USERS = [
  { email: process.env.SEED_ADMIN_EMAIL ?? "admin@batterysocbenchmark.ca", name: "Benchmark Admin", affiliation: "McMaster University", role: "ADMIN" as const, password: process.env.SEED_ADMIN_PASSWORD ?? "Admin123!" },
  { email: "r.singh@example.edu", name: "Riya Singh", affiliation: "McMaster University", role: "USER" as const, password: "Password1" },
  { email: "t.nguyen@example.edu", name: "Thanh Nguyen", affiliation: "McMaster University", role: "USER" as const, password: "Password1" },
  { email: "l.fischer@example.edu", name: "Lena Fischer", affiliation: "McMaster University", role: "USER" as const, password: "Password1" },
  { email: "j.chen@example.edu", name: "Jia Chen", affiliation: "University of Waterloo", role: "USER" as const, password: "Password1" },
  { email: "m.okafor@example.edu", name: "Maya Okafor", affiliation: "TU Munich", role: "USER" as const, password: "Password1" },
  { email: "s.park@example.com", name: "Seo-yeon Park", affiliation: "LG Energy Solution", role: "USER" as const, password: "Password1" },
];


async function main() {
  console.log("Seeding…");
  await db.contactMessage.deleteMany();
  await db.submission.deleteMany();
  await db.contestEntry.deleteMany();
  await db.contest.deleteMany();
  await db.userToken.deleteMany();
  await db.user.deleteMany();

  const users = new Map<string, { id: string }>();
  for (const u of USERS) {
    const created = await db.user.create({
      data: { email: u.email, name: u.name, affiliation: u.affiliation, role: u.role, emailVerified: new Date(), passwordHash: await bcrypt.hash(u.password, 11) },
    });
    users.set(u.email, created);
  }

  const now = Date.now();
  const contest = await db.contest.create({
    data: {
      slug: "soc-challenge-2026",
      title: "2026 Battery SOC Estimation Challenge",
      summary: "Build the most accurate and robust state-of-charge estimator for the Tesla 2170 cell across −20 °C to 40 °C. Cash prizes for the top three weighted-error scores.",
      prizeText: "CA$5,000 first prize · CA$2,000 second · CA$1,000 third",
      startsAt: new Date(now - 14 * 86400e3),
      endsAt: new Date(now + 45 * 86400e3),
      status: "OPEN",
      maxSubmissionsPerUser: 5,
      description: `## About the challenge

The McMaster Automotive Resource Centre invites researchers, students and industry teams to benchmark their battery state-of-charge (SOC) estimation algorithms on a blinded, standardized dataset collected from Tesla Model 3 2170 cells.

Entries are evaluated on the same 12 blinded test cases as the public leaderboard, but the **contest leaderboard is frozen at the deadline** and ranked by *weighted error*, which up-weights the hardest conditions: −20 °C, 1000 kg payload, unknown initial SOC and sensor faults.

## Timeline

| Milestone | Date |
| --- | --- |
| Registration opens | Contest start |
| Submission deadline | Contest end (23:59 Eastern) |
| Winners announced | Within 3 weeks of the deadline |

## Prizes

- **First:** CA$5,000
- **Second:** CA$2,000
- **Third:** CA$1,000

Winning teams will be invited to present their approach at a McMaster battery research seminar.`,
      rules: `## Eligibility

1. Open to individuals and teams worldwide. One registration per team; the registered account submits on the team's behalf.
2. Employees of the organising lab may submit but are not eligible for prizes.

## Submissions

3. Up to **5 evaluated submissions** per team. Your best weighted error counts.
4. Models must be submitted in the standard format (MATLAB \`.mat\` function package or Python \`.py\` module) and run inside the evaluator time budget.
5. Models may only be trained on the **open** portion of the dataset and other public data. Any attempt to reconstruct or infer the blinded cells or cycles is disqualifying.
6. Contest submissions are public on the contest leaderboard (model name, author, affiliation, scores). Model files are deleted after evaluation and never shared.

## Judging

7. Ranking is by weighted error at the deadline. Ties are broken by all-cells RMSE, then by earlier submission time.
8. Winners must provide a short (2-page) technical description to receive a prize.
9. The organisers' decisions are final.`,
    },
  });

  for (const email of ["t.nguyen@example.edu", "j.chen@example.edu", "m.okafor@example.edu", "s.park@example.com"]) {
    await db.contestEntry.create({ data: { contestId: contest.id, userId: users.get(email)!.id, acceptedTerms: new Date(now - 10 * 86400e3) } });
  }

  console.log("Done.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
